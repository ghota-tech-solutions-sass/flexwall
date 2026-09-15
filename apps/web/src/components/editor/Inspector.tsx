// Rendered inside the Editor client boundary.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { parseTypedNumber, themeBackground, type ConnectorDef, type WidgetInputDef } from "@flexwall/sdk";
import { sourcesFor, tilesUsing, type SourceOption } from "@/application/editor/draft";
import { editorTheme } from "@/application/editor/state";
import type { InputTarget } from "@/application/editor/store";
import { connectionDetail, displayNameText, type ConnectionView } from "@/domain/connection";
import { connectorOfSource, sameSource, sourceOfBinding, type SourceRef } from "@/domain/source";
import { canUseTheme, effectiveTheme, STATIC_TEXT_MAX, VISIBILITIES, type Tile, type Visibility } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { ConnectForm } from "@/components/connections/ConnectForm";
import { ConnectionTitle } from "@/components/connections/ConnectionTitle";
import { RenameField } from "@/components/connections/RenameField";
import { FieldInput } from "@/components/forms/FieldInput";
import { removalWarning, usageLine } from "@/presentation/connections";
import { SHORTCUTS } from "@/presentation/editor/shortcuts";
import { tileStatus } from "@/presentation/editor/tile-status";
import { ROUTES } from "@/presentation/routes";
import { useConnectionNames, useEditor, useEditorActions } from "./EditorContext";
import { CategoryIcon, CheckIcon, ChevronIcon, CloseIcon, CopyIcon, KeyIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, TypeIcon } from "./icons";

const VISIBILITY_LABELS: Record<Visibility, string> = { public: "Everyone", private: "Only me" };

/** Label of the "no source" choice on optional inputs. */
const NO_SOURCE_LABEL = "Nothing";

/** The selected tile's settings, grouped the way owners think about them; with nothing selected, the wall's own. */
export function Inspector() {
  const tile = useEditor((s) => s.draft.tiles.find((t) => t.id === s.selected) ?? null);
  return (
    <div className="ed-panel" key={tile?.id ?? "wall"}>
      {tile ? <TileInspector tile={tile} /> : <WallPanel />}
    </div>
  );
}

function TileInspector({ tile }: { tile: Tile }) {
  const widget = catalog.widget(tile.widget);
  const state = useEditor((s) => s.states[tile.id]);
  const paid = useEditor((s) => s.entitlements.paid);
  const actions = useEditorActions();
  const status = tileStatus(state);

  return (
    <>
      <header className="ed-head">
        <span className="ed-glyph">{widget ? <CategoryIcon category={widget.category} /> : <KeyIcon />}</span>
        <div>
          <h2>{widget?.name ?? "Removed widget"}</h2>
          <p>{widget?.description ?? "This widget isn't installed anymore. Delete the tile."}</p>
        </div>
        <button type="button" className="ed-icon-btn" aria-label="Close tile settings" title="Close (Esc)" onClick={() => actions.select(null)}>
          <CloseIcon />
        </button>
      </header>

      {widget ? (
        <>
          {status ? (
            <p className="ed-status" data-tone={status.tone}>
              <span className="ed-dot" />
              <span>{status.label}</span>
              {status.value ? <strong>{status.value}</strong> : null}
            </p>
          ) : null}

          <div className="ed-row">
            <span className="ed-label">Shown to</span>
            <div className="ed-segment" role="radiogroup" aria-label="Who sees this tile">
              {VISIBILITIES.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={tile.visibility === v} onClick={() => actions.setVisibility(tile.id, v)}>
                  {VISIBILITY_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          {widget.inputs.map((input) => (
            <Group key={input.key} title={widget.inputs.length > 1 ? input.label : "Data"}>
              <InputEditor tile={tile} input={input} paid={paid} />
            </Group>
          ))}

          {widget.options.length ? (
            <Group title="Appearance">
              {widget.options.map((f) => (
                <FieldInput key={f.key} field={f} value={tile.options[f.key]} onChange={(v) => actions.setOption(tile.id, f.key, v)} />
              ))}
            </Group>
          ) : null}
        </>
      ) : null}

      <footer className="ed-foot">
        <button type="button" className="ed-foot-btn" onClick={() => actions.duplicateTile(tile.id)} disabled={!widget}>
          <CopyIcon /> Duplicate
        </button>
        <button type="button" className="ed-foot-btn danger" onClick={() => actions.removeTile(tile.id)}>
          <TrashIcon /> Delete tile
        </button>
      </footer>
    </>
  );
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

function InputEditor({ tile, input, paid }: { tile: Tile; input: WidgetInputDef; paid: boolean }) {
  const actions = useEditorActions();
  const connections = useEditor((s) => s.connections);
  const request = useEditor((s) => s.connectRequest);
  const sources = useMemo(() => sourcesFor(input, catalog), [input]);
  const target: InputTarget = { tileId: tile.id, inputKey: input.key };
  const binding = tile.inputs[input.key];
  const source = sourceOfBinding(binding);

  const connector = binding?.kind === "metric" ? catalog.connector(binding.connector) : null;
  const metric = binding?.kind === "metric" ? catalog.metric(binding.connector, binding.metric) : null;
  const own = connector ? connections.filter((c) => c.connector === connector.id) : [];

  return (
    <>
      <SourcePicker sources={sources} value={source} optional={Boolean(input.optional)} paid={paid} onPick={(ref) => actions.pickSource(target, ref)} />

      {binding?.kind === "static" && binding.value.type === "number" ? (
        <label className="field">
          <span>Value</span>
          <input
            inputMode="decimal"
            value={binding.value.value}
            onChange={(e) => {
              const n = parseTypedNumber(e.target.value);
              if (n !== null && binding.value.type === "number") actions.setBinding(target, { kind: "static", value: { ...binding.value, value: n } });
            }}
          />
        </label>
      ) : null}
      {binding?.kind === "static" && binding.value.type === "text" ? (
        <label className="field">
          <span>Text</span>
          <input value={binding.value.value} maxLength={STATIC_TEXT_MAX} onChange={(e) => actions.setBinding(target, { kind: "static", value: { type: "text", value: e.target.value } })} />
        </label>
      ) : null}

      {binding?.kind === "metric" && metric
        ? (metric.params ?? []).map((f) => <FieldInput key={f.key} field={f} value={binding.params[f.key]} onChange={(v) => actions.setBinding(target, { ...binding, params: { ...binding.params, [f.key]: v ?? "" } })} />)
        : null}

      {binding?.kind === "metric" && connector?.auth ? (
        <AccountPicker connector={connector} target={target} current={binding.connection} own={own} focusKey={request?.tileId === tile.id ? request.count : undefined} />
      ) : null}

      {binding?.kind === "metric" && connector?.tier === "pro" && !paid ? (
        <p className="ed-note">
          The editor shows live {connector.name} numbers. Your public page shows them with <a href={ROUTES.pricing}>Pro</a>.
        </p>
      ) : null}
    </>
  );
}

function SourceMark({ source }: { source: SourceRef | null }) {
  if (!source) return <span className="ed-mark empty" />;
  const connector = connectorOfSource(source);
  if (!connector) return <span className="ed-mark"><TypeIcon size={14} /></span>;
  return <span className="ed-mark">{hasMark(connector) ? <BrandMark id={connector} size={14} /> : <CategoryIcon category="charts" size={14} />}</span>;
}

/** One row of the picker: a source, or "nothing" on optional inputs. */
type PickerRow = { ref: SourceRef | null; key: string; label: string; group: string | null; pro: boolean };

const NOTHING_ROW: PickerRow = { ref: null, key: "", label: NO_SOURCE_LABEL, group: null, pro: false };

const rowOf = (s: SourceOption): PickerRow => ({ ref: s.ref, key: s.key, label: s.label, group: s.group, pro: s.pro });

/** A searchable list of every source, grouped by where the number comes from. Replaces a long native select. */
function SourcePicker({ sources, value, optional, paid, onPick }: { sources: SourceOption[]; value: SourceRef | null; optional: boolean; paid: boolean; onPick: (ref: SourceRef | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const rows = useMemo<PickerRow[]>(() => (optional ? [NOTHING_ROW, ...sources.map(rowOf)] : sources.map(rowOf)), [optional, sources]);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.group ?? ""} ${r.label}`.toLowerCase().includes(q)) : rows;
  const current = rows.find((r) => sameSource(r.ref, value));

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
    setActive(Math.max(0, rows.findIndex((r) => sameSource(r.ref, value))));
    setOpen(!open);
  };
  const pick = (row: PickerRow) => {
    setOpen(false);
    if (!sameSource(row.ref, value)) onPick(row.ref);
  };

  return (
    <div className="ed-source" ref={root}>
      <span className="ed-label">Comes from</span>
      <button type="button" className="ed-source-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={toggle}>
        <SourceMark source={value} />
        <span>
          <strong>{current?.label ?? NO_SOURCE_LABEL}</strong>
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
            {shown.map((row, i) => (
              <SourceRow key={row.key} row={row} index={i} id={`${listId}-${i}`} heading={row.group && row.group !== shown[i - 1]?.group ? row.group : null} active={i === active} selected={sameSource(row.ref, value)} paid={paid} onHover={setActive} onPick={pick} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SourceRow({ row, index, id, heading, active, selected, paid, onHover, onPick }: { row: PickerRow; index: number; id: string; heading: string | null; active: boolean; selected: boolean; paid: boolean; onHover: (i: number) => void; onPick: (row: PickerRow) => void }) {
  return (
    <>
      {heading ? (
        <li className="ed-pop-group" role="presentation">
          {heading}
        </li>
      ) : null}
      <li id={id} data-index={index} role="option" aria-selected={selected} data-active={active} onMouseMove={() => !active && onHover(index)} onClick={() => onPick(row)}>
        <SourceMark source={row.ref} />
        <span>{row.label}</span>
        {row.pro && !paid ? <span className="badge">Pro</span> : null}
        {selected ? <CheckIcon size={14} /> : null}
      </li>
    </>
  );
}

function ConnectorMark({ id }: { id: string }) {
  return <span className="ed-mark">{hasMark(id) ? <BrandMark id={id} size={14} /> : <KeyIcon size={14} />}</span>;
}

/** Which account feeds the input, and the form to add one without leaving the tile. */
function AccountPicker({ connector, target, current, own, focusKey }: { connector: ConnectorDef; target: InputTarget; current: string | null; own: ConnectionView[]; focusKey: number | undefined }) {
  const actions = useEditorActions();
  const names = useConnectionNames();
  const [adding, setAdding] = useState(false);
  const showForm = adding || own.length === 0;

  return (
    <div className="ed-accounts">
      <span className="ed-label">{connector.name} account</span>
      {own.length ? (
        <ul className="ed-options" role="radiogroup" aria-label={`${connector.name} account`}>
          {own.map((c) => (
            <li key={c.id}>
              <button type="button" role="radio" aria-checked={current === c.id} onClick={() => actions.chooseAccount(target, c.id)}>
                <ConnectorMark id={connector.id} />
                <span>
                  <strong>
                    <ConnectionTitle shown={names[c.id]} fallback={c.label} />
                  </strong>
                  {connectionDetail(c) ? <small>{connectionDetail(c)}</small> : null}
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
          <ConnectForm connectorId={connector.id} focusKey={focusKey} connect={(values) => actions.connectAccount(connector.id, values, target)} signIn={(values) => actions.signIn(connector.id, values, ROUTES.edit)} onConnected={() => setAdding(false)} onCancel={own.length ? () => setAdding(false) : undefined} />
        </div>
      ) : (
        <button type="button" className="ed-add" onClick={() => setAdding(true)}>
          <PlusIcon size={14} /> Add another {connector.name} account
        </button>
      )}
    </div>
  );
}

function WallPanel() {
  const shown = useEditor((s) => editorTheme(s, catalog));
  const trying = useEditor((s) => s.themePreview !== null);
  const chosen = useEditor((s) => catalog.theme(s.draft.theme));
  const onWall = useEditor((s) => effectiveTheme(s.draft, catalog, s.entitlements));
  const published = useEditor((s) => s.draft.published);
  const listed = useEditor((s) => s.draft.listed);
  const connections = useEditor((s) => s.connections);
  const entitlements = useEditor((s) => s.entitlements);
  const actions = useEditorActions();

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
          {catalog.themes().map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={shown.id === t.id} className="ed-theme" onClick={() => actions.setTheme(t.id)}>
              <span className="ed-theme-swatch" style={themeBackground(t)}>
                <i style={{ background: t.tile, boxShadow: `inset 0 0 0 1px ${t.tileBorder}` }}>
                  <b style={{ background: t.accent }} />
                </i>
                <i style={{ background: t.tile, boxShadow: `inset 0 0 0 1px ${t.tileBorder}` }}>
                  <b style={{ background: t.muted }} />
                </i>
              </span>
              <span className="ed-theme-name">
                {t.name}
                {canUseTheme(t, entitlements) ? null : <span className="badge">Pro</span>}
              </span>
            </button>
          ))}
        </div>
        {trying ? (
          <div className="ed-trying" role="status">
            <p>
              <strong>Trying on {shown.name}.</strong> It&apos;s a Pro theme: your wall stays on {onWall.name} until you go Pro.
            </p>
            <div className="ed-trying-actions">
              <a className="btn btn-signal btn-small" href={ROUTES.pricing}>
                Go Pro
              </a>
              <button type="button" className="btn btn-small btn-quiet" onClick={actions.endThemePreview}>
                Keep {onWall.name}
              </button>
            </div>
          </div>
        ) : chosen && chosen.id !== onWall.id ? (
          <p className="ed-note">
            {chosen.name} comes back when you go <a href={ROUTES.pricing}>Pro</a>. Until then your wall uses {onWall.name}.
          </p>
        ) : null}
      </Group>

      <Group title="Visibility">
        <label className="ed-switch">
          <span>
            <strong>Published</strong>
            <small>Anyone with the link can see your wall.</small>
          </span>
          <input type="checkbox" role="switch" checked={published} onChange={(e) => actions.setPublished(e.target.checked)} />
        </label>
        <label className="ed-switch" data-disabled={!published}>
          <span>
            <strong>List me on The Wall</strong>
            <small>{published ? "Your verified numbers can rank on The Wall." : "Publish first to be listed."}</small>
          </span>
          <input type="checkbox" role="switch" disabled={!published} checked={listed} onChange={(e) => actions.setListed(e.target.checked)} />
        </label>
      </Group>

      <Group title="Accounts" aside={connections.length ? <span className="ed-count">{connections.length}</span> : null}>
        <Accounts />
      </Group>

      <Group title="Shortcuts" defaultOpen={false}>
        <dl className="ed-keys">
          {SHORTCUTS.map((s) => (
            <div key={s.action}>
              <dt>{s.label}</dt>
              <dd>
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Group>
    </>
  );
}

/** Adding an account: closed, choosing a connector, or filling one's form. */
type AddAccount = { step: "closed" } | { step: "choose" } | { step: "form"; connectorId: string };

/** What the owner is doing to one account in the list. */
type AccountEdit = { kind: "rename" | "remove"; connectionId: string } | null;

/** Every connected account with the tiles it feeds, renamable and removable, and a way to add one before any tile needs it. */
function Accounts() {
  const connections = useEditor((s) => s.connections);
  const tiles = useEditor((s) => s.draft.tiles);
  const paid = useEditor((s) => s.entitlements.paid);
  const actions = useEditorActions();
  const names = useConnectionNames();
  const [adding, setAdding] = useState<AddAccount>({ step: "closed" });
  const [editing, setEditing] = useState<AccountEdit>(null);
  const [error, setError] = useState<string | null>(null);
  const authConnectors = catalog.connectors().filter((c) => c.auth);

  const remove = async (connection: ConnectionView) => {
    setError(null);
    const outcome = await actions.removeAccount(connection);
    if (outcome.ok) setEditing(null);
    else setError(outcome.message);
  };
  const edit = (next: AccountEdit) => {
    setError(null);
    setEditing(next);
  };

  return (
    <div className="ed-accounts">
      {connections.length ? (
        <ul className="ed-options static">
          {connections.map((c) => {
            const name = displayNameText(names[c.id] ?? { name: c.label, number: null });
            const detail = connectionDetail(c);
            const used = tilesUsing(c.id, tiles, catalog);
            const confirming = editing?.kind === "remove" && editing.connectionId === c.id;
            const renaming = editing?.kind === "rename" && editing.connectionId === c.id;
            return (
              <li key={c.id}>
                <div>
                  <ConnectorMark id={c.connector} />
                  <span>
                    <strong>
                      <ConnectionTitle shown={names[c.id]} fallback={c.label} />
                    </strong>
                    <small>{[catalog.connector(c.connector)?.name ?? c.connector, detail].filter(Boolean).join(" · ")}</small>
                  </span>
                  {confirming ? (
                    <span className="ed-confirm">
                      <button type="button" className="danger" onClick={() => void remove(c)}>
                        Remove
                      </button>
                      <button type="button" onClick={() => edit(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="ed-row-actions">
                      <button type="button" className="ed-icon-btn" aria-label={`Rename ${name}`} aria-expanded={renaming} title="Rename" onClick={() => edit(renaming ? null : { kind: "rename", connectionId: c.id })}>
                        <PencilIcon size={14} />
                      </button>
                      <button type="button" className="ed-icon-btn" aria-label={`Remove ${name}`} title="Remove" onClick={() => edit({ kind: "remove", connectionId: c.id })}>
                        <TrashIcon size={14} />
                      </button>
                    </span>
                  )}
                </div>
                {renaming ? <RenameField nickname={c.nickname} label={c.label} save={(nickname) => actions.renameAccount(c.id, nickname)} onDone={() => edit(null)} /> : null}
                <p className="ed-usage">
                  <span>{usageLine(used)}</span>
                  {used.map((t) => (
                    <button key={t.id} type="button" title="Select this tile" onClick={() => actions.select(t.id)}>
                      {t.name}
                    </button>
                  ))}
                </p>
                {confirming ? <p className="ed-note">{removalWarning(used)}</p> : null}
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

      {adding.step === "closed" ? (
        <button type="button" className="ed-add" onClick={() => setAdding({ step: "choose" })}>
          <PlusIcon size={14} /> Connect an account
        </button>
      ) : adding.step === "choose" ? (
        <div className="ed-connect">
          <div className="ed-chips">
            {authConnectors.map((c) => (
              <button key={c.id} type="button" onClick={() => setAdding({ step: "form", connectorId: c.id })}>
                <ConnectorMark id={c.id} />
                {c.name}
                {c.tier === "pro" && !paid ? <span className="badge">Pro</span> : null}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => setAdding({ step: "closed" })}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="ed-connect">
          <div className="ed-connect-head">
            <ConnectorMark id={adding.connectorId} />
            <div>
              <strong>Connect {catalog.connector(adding.connectorId)?.name}</strong>
              <span>The key is encrypted and never shown again.</span>
            </div>
          </div>
          <ConnectForm
            key={adding.connectorId}
            connectorId={adding.connectorId}
            focusKey={0}
            connect={(values) => actions.connectAccount(adding.connectorId, values)}
            signIn={(values) => actions.signIn(adding.connectorId, values, ROUTES.edit)}
            onConnected={() => setAdding({ step: "closed" })}
            onCancel={() => setAdding({ step: "choose" })}
          />
        </div>
      )}
    </div>
  );
}

