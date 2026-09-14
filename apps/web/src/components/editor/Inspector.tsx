// Rendered inside the Editor client boundary.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatValue, type ConnectorDef, type FieldValue, type InputValue, type WidgetInputDef } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { ConnectionView } from "@/domain/connection";
import type { Entitlements } from "@/domain/user";
import type { Binding, Tile, WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { ConnectForm } from "@/components/connections/ConnectForm";
import { FieldInput } from "@/components/forms/FieldInput";
import { bindingFor, setBinding, sourcesFor, sourceValueOf, updateTile, type SourceOption } from "./editor-model";
import { CategoryIcon, CheckIcon, ChevronIcon, CloseIcon, CopyIcon, KeyIcon, PlusIcon, SearchIcon, TrashIcon, TypeIcon } from "./icons";

type Change = (next: (d: WallDraft) => WallDraft) => void;

interface Props {
  draft: WallDraft;
  tile: Tile | null;
  state: TileState | undefined;
  entitlements: Entitlements;
  connections: ConnectionView[];
  /** Set when the owner asked to connect an account from a tile: focus its form. */
  connectFocus: number | undefined;
  onChange: Change;
  onDeselect: () => void;
  onRemove: (tileId: string) => void;
  onDuplicate: (tileId: string) => void;
  onConnected: (c: ConnectionView) => void;
  onDisconnected: (c: ConnectionView) => void;
}

/** The selected tile's settings, grouped the way owners think about them; with nothing selected, the wall's own. */
export function Inspector(props: Props) {
  const { tile } = props;
  return (
    <div className="ed-panel" key={tile?.id ?? "wall"}>
      {tile ? <TileInspector {...props} tile={tile} /> : <WallPanel {...props} />}
    </div>
  );
}

function TileInspector({ tile, state, entitlements, connections, connectFocus, onChange, onDeselect, onRemove, onDuplicate, onConnected }: Props & { tile: Tile }) {
  const widget = catalog.widget(tile.widget);

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
    <>
      <header className="ed-head">
        <span className="ed-glyph">
          <CategoryIcon category={widget?.category ?? "content"} />
        </span>
        <div>
          <h2>{widget?.name ?? "Removed widget"}</h2>
          <p>{widget?.description ?? "This widget isn't installed anymore. Delete the tile."}</p>
        </div>
        <button type="button" className="ed-icon-btn" aria-label="Close tile settings" title="Close (Esc)" onClick={onDeselect}>
          <CloseIcon />
        </button>
      </header>

      {widget ? (
        <>
          <TileStatus state={state} />

          <div className="ed-row">
            <span className="ed-label">Shown to</span>
            <div className="ed-segment" role="radiogroup" aria-label="Who sees this tile">
              {(["public", "private"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={tile.visibility === v} onClick={() => onChange((d) => updateTile(d, tile.id, (t) => ({ ...t, visibility: v })))}>
                  {v === "public" ? "Everyone" : "Only me"}
                </button>
              ))}
            </div>
          </div>

          {widget.inputs.map((input) => (
            <Group key={input.key} title={widget.inputs.length > 1 ? input.label : "Data"}>
              <InputEditor input={input} tile={tile} entitlements={entitlements} connections={connections} connectFocus={connectFocus} onChange={onChange} onConnected={onConnected} />
            </Group>
          ))}

          {widget.options.length ? (
            <Group title="Appearance">
              {widget.options.map((f) => (
                <FieldInput key={f.key} field={f} value={tile.options[f.key]} onChange={(v) => setOption(f.key, v)} />
              ))}
            </Group>
          ) : null}
        </>
      ) : null}

      <footer className="ed-foot">
        <button type="button" className="ed-foot-btn" onClick={() => onDuplicate(tile.id)} disabled={!widget}>
          <CopyIcon /> Duplicate
        </button>
        <button type="button" className="ed-foot-btn danger" onClick={() => onRemove(tile.id)}>
          <TrashIcon /> Delete tile
        </button>
      </footer>
    </>
  );
}

/** What the tile shows right now, in one line: the owner never has to guess why a tile is blank. */
function TileStatus({ state }: { state: TileState | undefined }) {
  if (!state)
    return (
      <p className="ed-status" data-tone="wait">
        <span className="ed-dot" />
        Loading the value…
      </p>
    );
  if (state.status === "placeholder") {
    const tone = state.reason === "connect" ? "action" : state.reason === "pro" ? "pro" : "warn";
    return (
      <p className="ed-status" data-tone={tone}>
        <span className="ed-dot" />
        {state.reason === "connect" ? "Waiting for an account" : state.message}
      </p>
    );
  }
  const first = Object.values(state.inputs)[0];
  if (!first) return null;
  const tone = first.stale ? "warn" : first.source?.verified ? "ok" : "live";
  const label = first.stale ? "Last known value" : first.source ? (first.source.verified ? `Verified by ${first.source.name}` : `Live from ${first.source.name}`) : "Typed by you";
  return (
    <p className="ed-status" data-tone={tone}>
      <span className="ed-dot" />
      <span>{label}</span>
      <strong>{preview(first)}</strong>
    </p>
  );
}

function preview({ value }: InputValue): string {
  switch (value.type) {
    case "number":
      return formatValue(value);
    case "text":
      return value.value.length > 22 ? `${value.value.slice(0, 21)}…` : value.value;
    case "series":
      return `${value.points.length} points`;
    case "calendar":
      return `${value.days.length} days`;
  }
}

function Group({ title, children, aside, defaultOpen = true }: { title: string; children: ReactNode; aside?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="ed-group" data-open={open}>
      <button type="button" className="ed-group-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        {aside}
        <ChevronIcon size={14} />
      </button>
      <div className="ed-group-body" id={id} inert={!open}>
        <div>{children}</div>
      </div>
    </section>
  );
}

function InputEditor({
  input,
  tile,
  entitlements,
  connections,
  connectFocus,
  onChange,
  onConnected,
}: {
  input: WidgetInputDef;
  tile: Tile;
  entitlements: Entitlements;
  connections: ConnectionView[];
  connectFocus: number | undefined;
  onChange: Change;
  onConnected: (c: ConnectionView) => void;
}) {
  const binding = tile.inputs[input.key];
  const sources = useMemo(() => sourcesFor(input, catalog), [input]);
  const set = (next: Binding | undefined) => onChange((d) => setBinding(d, tile.id, input.key, next, catalog));

  const connector = binding?.kind === "metric" ? catalog.connector(binding.connector) : null;
  const metric = binding?.kind === "metric" ? catalog.metric(binding.connector, binding.metric) : null;
  const own = connector ? connections.filter((c) => c.connector === connector.id) : [];

  return (
    <>
      <SourcePicker sources={sources} value={sourceValueOf(binding)} optional={Boolean(input.optional)} paid={entitlements.paid} onPick={(v) => set(v ? bindingFor(v, catalog, connections, binding) : undefined)} />

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
        ? (metric.params ?? []).map((f) => <FieldInput key={f.key} field={f} value={binding.params[f.key]} onChange={(v) => set({ ...binding, params: { ...binding.params, [f.key]: v ?? "" } })} />)
        : null}

      {binding?.kind === "metric" && connector?.auth ? (
        <AccountPicker
          connector={connector}
          current={binding.connection}
          own={own}
          focusKey={connectFocus}
          onPick={(id) => set({ ...binding, connection: id })}
          onConnected={(c) => {
            onConnected(c);
            set({ ...binding, connection: c.id });
          }}
        />
      ) : null}

      {binding?.kind === "metric" && connector?.tier === "pro" && !entitlements.paid ? (
        <p className="ed-note">
          The editor shows live {connector.name} numbers. Your public page shows them with <a href="/pricing">Pro</a>.
        </p>
      ) : null}
    </>
  );
}

function SourceMark({ value }: { value: string }) {
  const [kind, connector] = value.split(":");
  if (!value) return <span className="ed-mark empty" />;
  if (kind === "static") return <span className="ed-mark"><TypeIcon size={14} /></span>;
  return <span className="ed-mark">{hasMark(connector) ? <BrandMark id={connector} size={14} /> : <CategoryIcon category="charts" size={14} />}</span>;
}

/** A searchable list of every source, grouped by where the number comes from. Replaces a long native select. */
function SourcePicker({ sources, value, optional, paid, onPick }: { sources: SourceOption[]; value: string; optional: boolean; paid: boolean; onPick: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const all = useMemo<SourceOption[]>(() => (optional ? [{ value: "", label: "Nothing", group: "", pro: false }, ...sources] : sources), [optional, sources]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((s) => `${s.group} ${s.label}`.toLowerCase().includes(q)) : all;
  const current = all.find((s) => s.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const toggle = () => {
    setQuery("");
    setActive(Math.max(0, all.findIndex((s) => s.value === value)));
    setOpen(!open);
  };
  const pick = (s: SourceOption) => {
    setOpen(false);
    if (s.value !== value) onPick(s.value);
  };

  return (
    <div className="ed-source" ref={root}>
      <span className="ed-label">Comes from</span>
      <button type="button" className="ed-source-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={toggle}>
        <SourceMark value={value} />
        <span>
          <strong>{current?.label ?? "Nothing"}</strong>
          {current?.group ? <small>{current.group}</small> : null}
        </span>
        <ChevronIcon size={14} />
      </button>
      {open ? (
        <div className="ed-pop">
          <label className="ed-search">
            <SearchIcon size={14} />
            <input
              autoFocus
              placeholder="Search Stripe, GitHub, a typed number…"
              value={query}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              onChange={(e) => (setQuery(e.target.value), setActive(0))}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(shown.length - 1, i + 1)));
                else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
                else if (e.key === "Enter" && shown[active]) (e.preventDefault(), pick(shown[active]));
                else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(false));
              }}
            />
          </label>
          <ul role="listbox" id={listId} ref={list}>
            {shown.length === 0 ? <li className="ed-pop-empty">No source matches “{query}”.</li> : null}
            {shown.map((s, i) => (
              <SourceRow key={s.value || "none"} source={s} index={i} id={`${listId}-${i}`} heading={s.group && s.group !== shown[i - 1]?.group ? s.group : null} active={i === active} selected={s.value === value} paid={paid} onHover={setActive} onPick={pick} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SourceRow({ source, index, id, heading, active, selected, paid, onHover, onPick }: { source: SourceOption; index: number; id: string; heading: string | null; active: boolean; selected: boolean; paid: boolean; onHover: (i: number) => void; onPick: (s: SourceOption) => void }) {
  return (
    <>
      {heading ? (
        <li className="ed-pop-group" role="presentation">
          {heading}
        </li>
      ) : null}
      <li id={id} data-index={index} role="option" aria-selected={selected} data-active={active} onMouseMove={() => !active && onHover(index)} onClick={() => onPick(source)}>
        <SourceMark value={source.value} />
        <span>{source.label}</span>
        {source.pro && !paid ? <span className="badge">Pro</span> : null}
        {selected ? <CheckIcon size={14} /> : null}
      </li>
    </>
  );
}

function ConnectorMark({ id }: { id: string }) {
  return <span className="ed-mark">{hasMark(id) ? <BrandMark id={id} size={14} /> : <KeyIcon size={14} />}</span>;
}

/** Which account feeds the tile, and the form to add one without leaving the tile. */
function AccountPicker({ connector, current, own, focusKey, onPick, onConnected }: { connector: ConnectorDef; current: string | null; own: ConnectionView[]; focusKey: number | undefined; onPick: (id: string) => void; onConnected: (c: ConnectionView) => void }) {
  const [adding, setAdding] = useState(false);
  const showForm = adding || own.length === 0;
  return (
    <div className="ed-accounts">
      <span className="ed-label">{connector.name} account</span>
      {own.length ? (
        <ul className="ed-options" role="radiogroup" aria-label={`${connector.name} account`}>
          {own.map((c) => (
            <li key={c.id}>
              <button type="button" role="radio" aria-checked={current === c.id} onClick={() => onPick(c.id)}>
                <ConnectorMark id={connector.id} />
                <span>
                  <strong>{c.label}</strong>
                  {c.public.hint ? <small className="mono">{c.public.hint}</small> : null}
                </span>
                {current === c.id ? <CheckIcon size={14} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showForm ? (
        <div className="ed-connect" data-first={own.length === 0}>
          {own.length === 0 ? (
            <div className="ed-connect-head">
              <ConnectorMark id={connector.id} />
              <div>
                <strong>Connect {connector.name}</strong>
                <span>{connector.verified ? "Numbers read from your own account get the verified mark." : "Only used to read this number."} The key is encrypted and never shown again.</span>
              </div>
            </div>
          ) : null}
          <ConnectForm
            connectorId={connector.id}
            focusKey={focusKey}
            onConnected={(c) => {
              setAdding(false);
              onConnected(c);
            }}
            onCancel={own.length ? () => setAdding(false) : undefined}
          />
        </div>
      ) : (
        <button type="button" className="ed-add" onClick={() => setAdding(true)}>
          <PlusIcon size={14} /> Add another {connector.name} account
        </button>
      )}
    </div>
  );
}

function WallPanel({ draft, entitlements, connections, onChange, onConnected, onDisconnected }: Props) {
  const themes = catalog.themes();
  const theme = catalog.theme(draft.theme);
  return (
    <>
      <header className="ed-head">
        <span className="ed-glyph">
          <CategoryIcon category="content" />
        </span>
        <div>
          <h2>Wall</h2>
          <p>Click a tile to change it. Edit the title and bio right on the wall.</p>
        </div>
      </header>

      <Group title="Theme">
        <div className="ed-themes" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={draft.theme === t.id} className="ed-theme" onClick={() => onChange((d) => ({ ...d, theme: t.id }))}>
              <span className="ed-theme-swatch" style={{ background: t.wallpaper ? `${t.wallpaper}, ${t.page}` : t.page }}>
                <i style={{ background: t.tile, boxShadow: `inset 0 0 0 1px ${t.tileBorder}` }}>
                  <b style={{ background: t.accent }} />
                </i>
                <i style={{ background: t.tile, boxShadow: `inset 0 0 0 1px ${t.tileBorder}` }}>
                  <b style={{ background: t.ink, opacity: 0.5 }} />
                </i>
              </span>
              <span className="ed-theme-name">
                {t.name}
                {t.tier === "pro" && !entitlements.proThemes ? <span className="badge">Pro</span> : null}
              </span>
            </button>
          ))}
        </div>
        {theme?.tier === "pro" && !entitlements.proThemes ? <p className="ed-note">Your public page uses Night until you go <a href="/pricing">Pro</a>.</p> : null}
      </Group>

      <Group title="Visibility">
        <label className="ed-switch">
          <span>
            <strong>Published</strong>
            <small>Anyone with the link can see your wall.</small>
          </span>
          <input type="checkbox" role="switch" checked={draft.published} onChange={(e) => onChange((d) => ({ ...d, published: e.target.checked, listed: e.target.checked && d.listed }))} />
        </label>
        <label className="ed-switch" data-disabled={!draft.published}>
          <span>
            <strong>List me on The Wall</strong>
            <small>{draft.published ? "Your verified numbers can rank on The Wall." : "Publish first to be listed."}</small>
          </span>
          <input type="checkbox" role="switch" disabled={!draft.published} checked={draft.listed} onChange={(e) => onChange((d) => ({ ...d, listed: e.target.checked }))} />
        </label>
      </Group>

      <Group title="Accounts" aside={connections.length ? <span className="ed-count">{connections.length}</span> : null}>
        <Accounts connections={connections} paid={entitlements.paid} onConnected={onConnected} onDisconnected={onDisconnected} />
      </Group>

      <Group title="Shortcuts" defaultOpen={false}>
        <dl className="ed-keys">
          <div>
            <dt>Delete a selected tile</dt>
            <dd>
              <kbd>Delete</kbd>
            </dd>
          </div>
          <div>
            <dt>Duplicate it</dt>
            <dd>
              <kbd>⌘</kbd>
              <kbd>D</kbd>
            </dd>
          </div>
          <div>
            <dt>Undo a delete</dt>
            <dd>
              <kbd>⌘</kbd>
              <kbd>Z</kbd>
            </dd>
          </div>
          <div>
            <dt>Back to the wall settings</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
      </Group>
    </>
  );
}

/** Every connected account, removable, and a way to add one before any tile needs it. */
function Accounts({ connections, paid, onConnected, onDisconnected }: { connections: ConnectionView[]; paid: boolean; onConnected: (c: ConnectionView) => void; onDisconnected: (c: ConnectionView) => void }) {
  const [adding, setAdding] = useState<string | "pick" | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authConnectors = catalog.connectors().filter((c) => c.auth);

  return (
    <div className="ed-accounts">
      {connections.length ? (
        <ul className="ed-options static">
          {connections.map((c) => {
            const connector = catalog.connector(c.connector);
            return (
              <li key={c.id}>
                <div>
                  <ConnectorMark id={c.connector} />
                  <span>
                    <strong>{c.label}</strong>
                    <small>
                      {connector?.name ?? c.connector}
                      {c.public.hint ? <span className="mono"> {c.public.hint}</span> : null}
                    </small>
                  </span>
                  {confirming === c.id ? (
                    <span className="ed-confirm">
                      <button
                        type="button"
                        className="danger"
                        onClick={async () => {
                          setError(null);
                          const res = await fetch(`/api/connections/${c.id}`, { method: "DELETE" }).catch(() => null);
                          if (!res?.ok) return setError(`Couldn't remove ${c.label}. Try again.`);
                          setConfirming(null);
                          onDisconnected(c);
                        }}
                      >
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="ed-icon-btn" aria-label={`Remove ${c.label}`} title="Remove" onClick={() => setConfirming(c.id)}>
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
                {confirming === c.id ? <p className="ed-note">Tiles using this account will wait for another one.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ed-note">No accounts yet. Connect one here or from any tile that needs it.</p>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {adding === null ? (
        <button type="button" className="ed-add" onClick={() => setAdding("pick")}>
          <PlusIcon size={14} /> Connect an account
        </button>
      ) : adding === "pick" ? (
        <div className="ed-connect">
          <div className="ed-chips">
            {authConnectors.map((c) => (
              <button key={c.id} type="button" onClick={() => setAdding(c.id)}>
                <ConnectorMark id={c.id} />
                {c.name}
                {c.tier === "pro" && !paid ? <span className="badge">Pro</span> : null}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => setAdding(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="ed-connect">
          <div className="ed-connect-head">
            <ConnectorMark id={adding} />
            <div>
              <strong>Connect {catalog.connector(adding)?.name}</strong>
              <span>The key is encrypted and never shown again.</span>
            </div>
          </div>
          <ConnectForm
            key={adding}
            connectorId={adding}
            focusKey={0}
            onConnected={(c) => {
              setAdding(null);
              onConnected(c);
            }}
            onCancel={() => setAdding("pick")}
          />
        </div>
      )}
    </div>
  );
}
