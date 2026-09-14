// Rendered inside the Editor client boundary.
import type { FieldValue, WidgetInputDef } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { ConnectionView } from "@/domain/connection";
import type { Entitlements } from "@/domain/user";
import { BIO_MAX, TITLE_MAX, type Binding, type Tile, type WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { FieldInput } from "@/components/forms/FieldInput";
import { bindingFor, removeTile, setBinding, sourcesFor, sourceValueOf, updateTile } from "./editor-model";

interface Props {
  draft: WallDraft;
  tile: Tile | null;
  state: TileState | undefined;
  entitlements: Entitlements;
  connections: ConnectionView[];
  onChange: (next: (d: WallDraft) => WallDraft) => void;
  onDeselect: () => void;
}

/** Settings of the selected tile, drawn from its widget's inputs and options. With nothing selected, the wall's own settings. */
export function Inspector({ draft, tile, state, entitlements, connections, onChange, onDeselect }: Props) {
  if (!tile) return <WallSettings draft={draft} entitlements={entitlements} onChange={onChange} />;
  const widget = catalog.widget(tile.widget);
  if (!widget) return <p className="hint">This widget isn&apos;t installed anymore.</p>;

  const setOption = (key: string, value: FieldValue | undefined) =>
    onChange((d) =>
      updateTile(d, tile.id, (t) => {
        const options = { ...t.options };
        if (value === undefined) delete options[key];
        else options[key] = value;
        return { ...t, options };
      })
    );

  return (
    <div className="inspector">
      <section>
        <h3>{widget.name}</h3>
        <p className="hint">{widget.description}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={tile.visibility === "public"}
            onChange={(e) => onChange((d) => updateTile(d, tile.id, (t) => ({ ...t, visibility: e.target.checked ? "public" : "private" })))}
          />
          Visible on the public page
        </label>
        {state?.status === "placeholder" ? <p className="hint">{state.message}</p> : null}
      </section>

      {widget.inputs.map((input) => (
        <InputEditor key={input.key} input={input} tile={tile} entitlements={entitlements} connections={connections} onChange={onChange} />
      ))}

      {widget.options.length ? (
        <section>
          <h3>Appearance</h3>
          {widget.options.map((f) => (
            <FieldInput key={f.key} field={f} value={tile.options[f.key]} onChange={(v) => setOption(f.key, v)} />
          ))}
        </section>
      ) : null}

      <div className="row">
        <button type="button" className="btn btn-small btn-danger" onClick={() => (onChange((d) => removeTile(d, tile.id)), onDeselect())}>
          Remove tile
        </button>
      </div>
    </div>
  );
}

function InputEditor({ input, tile, entitlements, connections, onChange }: { input: WidgetInputDef; tile: Tile; entitlements: Entitlements; connections: ConnectionView[]; onChange: Props["onChange"] }) {
  const binding = tile.inputs[input.key];
  const sources = sourcesFor(input, catalog);
  const groups = [...new Set(sources.map((s) => s.group))];
  const set = (next: Binding | undefined) => onChange((d) => setBinding(d, tile.id, input.key, next, catalog));

  const connector = binding?.kind === "metric" ? catalog.connector(binding.connector) : null;
  const metric = binding?.kind === "metric" ? catalog.metric(binding.connector, binding.metric) : null;
  const ownConnections = connector ? connections.filter((c) => c.connector === connector.id) : [];

  return (
    <section>
      <h3>{input.label}</h3>
      <label className="field">
        <span>Comes from</span>
        <select value={sourceValueOf(binding)} onChange={(e) => set(e.target.value ? bindingFor(e.target.value, catalog, connections, binding) : undefined)}>
          {input.optional ? <option value="">Nothing</option> : null}
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {sources
                .filter((s) => s.group === g)
                .map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                    {s.pro && !entitlements.paid ? " (Pro)" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {binding?.kind === "static" && binding.value.type === "number" ? (
        <label className="field">
          <span>Value</span>
          <input
            inputMode="decimal"
            value={binding.value.value}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[\s,]/g, ""));
              if (Number.isFinite(n)) set({ kind: "static", value: { ...binding.value, value: n } as typeof binding.value });
            }}
          />
        </label>
      ) : null}
      {binding?.kind === "static" && binding.value.type === "text" ? (
        <label className="field">
          <span>Text</span>
          <input value={binding.value.value} maxLength={280} onChange={(e) => set({ kind: "static", value: { type: "text", value: e.target.value } })} />
        </label>
      ) : null}

      {binding?.kind === "metric" && metric
        ? (metric.params ?? []).map((f) => (
            <FieldInput key={f.key} field={f} value={binding.params[f.key]} onChange={(v) => set({ ...binding, params: { ...binding.params, [f.key]: v ?? "" } })} />
          ))
        : null}

      {binding?.kind === "metric" && connector?.auth ? (
        ownConnections.length ? (
          <label className="field">
            <span>{connector.name} account</span>
            <select value={binding.connection ?? ""} onChange={(e) => set({ ...binding, connection: e.target.value || null })}>
              <option value="">Choose…</option>
              {ownConnections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hint">
            <a href="/settings#connections">Connect {connector.name}</a> first; the tile shows a placeholder until then.
          </p>
        )
      ) : null}
      {binding?.kind === "metric" && connector?.tier === "pro" && !entitlements.paid ? (
        <p className="hint">
          The editor shows live {connector.name} numbers. Your public page shows them with <a href="/pricing">Pro</a>.
        </p>
      ) : null}
    </section>
  );
}

function WallSettings({ draft, entitlements, onChange }: { draft: WallDraft; entitlements: Entitlements; onChange: Props["onChange"] }) {
  const themes = catalog.themes();
  const theme = catalog.theme(draft.theme);
  return (
    <div className="inspector">
      <section>
        <h3>Your wall</h3>
        <p className="hint">Select a tile to change it. Drag to move, pull the corner to resize, Delete to remove.</p>
        <label className="field">
          <span>Title</span>
          <input value={draft.title} maxLength={TITLE_MAX} onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))} />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea value={draft.bio} maxLength={BIO_MAX} onChange={(e) => onChange((d) => ({ ...d, bio: e.target.value }))} />
        </label>
      </section>
      <section>
        <h3>Theme</h3>
        <label className="field">
          <span>Theme</span>
          <select value={draft.theme} onChange={(e) => onChange((d) => ({ ...d, theme: e.target.value }))}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.tier === "pro" && !entitlements.proThemes ? " (Pro)" : ""}
              </option>
            ))}
          </select>
        </label>
        {theme?.tier === "pro" && !entitlements.proThemes ? <p className="hint">Your public page uses Night until you go Pro.</p> : null}
      </section>
      <section>
        <h3>Visibility</h3>
        <label className="check">
          <input type="checkbox" checked={draft.published} onChange={(e) => onChange((d) => ({ ...d, published: e.target.checked, listed: e.target.checked && d.listed }))} />
          Published at /@handle
        </label>
        <label className="check">
          <input type="checkbox" disabled={!draft.published} checked={draft.listed} onChange={(e) => onChange((d) => ({ ...d, listed: e.target.checked }))} />
          List me on The Wall
        </label>
        <p className="hint">Only tiles marked visible appear publicly. Listing shows your verified numbers on Explore.</p>
      </section>
    </div>
  );
}
