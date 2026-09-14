// Rendered inside the Editor client boundary.
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GAP_UNITS, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { WALL_COLUMNS } from "@/domain/layout";
import { BIO_MAX, TITLE_MAX, type Tile, type WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { TileBody } from "@/rendering/tile";
import { applyLayout, updateTile } from "./editor-model";
import { CopyIcon, EyeIcon, EyeOffIcon, KeyIcon, PlusIcon, TrashIcon } from "./icons";

interface Props {
  draft: WallDraft;
  states: Record<string, TileState>;
  theme: Theme;
  today: string;
  selected: string | null;
  onSelect: (id: string) => void;
  onChange: (next: (d: WallDraft) => WallDraft) => void;
  onRemove: (tileId: string) => void;
  onDuplicate: (tileId: string) => void;
  onConnect: (tileId: string) => void;
  quickAdd: { id: string; name: string }[];
  onAdd: (widgetId: string) => void;
}

/** Controls drawn on a tile. Pointer events on them never start a drag. */
const NO_DRAG = ".tile-tools, .tile-connect";

/** The wall grid, draggable and resizable. Sizes come from each widget's declared min and max. */
export function WallCanvas({ draft, states, theme, today, selected, onSelect, onChange, onRemove, onDuplicate, onConnect, quickAdd, onAdd }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const unitsWide = WALL_COLUMNS * 100 + (WALL_COLUMNS - 1) * GAP_UNITS;
  const px = width / unitsWide;
  const cell = 100 * px;
  const gap = GAP_UNITS * px;

  const layout: Layout = draft.tiles.map((t) => {
    const widget = catalog.widget(t.widget);
    const [minW, minH] = widget?.size.min ?? [1, 1];
    const [maxW, maxH] = widget?.size.max ?? [4, 4];
    return { i: t.id, ...t.layout, minW, minH, maxW, maxH };
  });

  return (
    <div className="canvas-frame" style={{ background: theme.wallpaper ? `${theme.wallpaper}, ${theme.page}` : theme.page, color: theme.ink, colorScheme: theme.mode }}>
      <header className="canvas-head">
        <input
          className="canvas-title"
          aria-label="Wall title"
          placeholder="Your name or project"
          value={draft.title}
          maxLength={TITLE_MAX}
          style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight, color: theme.ink }}
          onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))}
        />
        <textarea
          className="canvas-bio"
          aria-label="Bio"
          placeholder="Add a short bio: what you build, for whom."
          rows={1}
          value={draft.bio}
          maxLength={BIO_MAX}
          style={{ color: theme.muted }}
          onChange={(e) => onChange((d) => ({ ...d, bio: e.target.value }))}
        />
      </header>
      <div ref={containerRef}>
        {mounted && width > 0 ? (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: WALL_COLUMNS, rowHeight: cell, margin: [gap, gap], containerPadding: [0, 0] }}
            compactor={verticalCompactor}
            dragConfig={{ cancel: NO_DRAG }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            // Commit on stop too: onLayoutChange can be skipped when a drag ends outside the grid.
            onLayoutChange={(next) => onChange((d) => applyLayout(d, next))}
            onDragStop={(next) => onChange((d) => applyLayout(d, next))}
            onResizeStop={(next) => onChange((d) => applyLayout(d, next))}
          >
            {draft.tiles.map((tile) => (
              <div
                key={tile.id}
                className={`grid-item${selected === tile.id ? " selected" : ""}${tile.visibility === "private" ? " private" : ""}`}
                tabIndex={0}
                aria-label={tileLabel(tile)}
                onMouseDown={() => onSelect(tile.id)}
                onFocus={(e) => e.target === e.currentTarget && onSelect(tile.id)}
              >
                <TileBody tile={tile} state={states[tile.id]} box={{ w: tile.layout.w, h: tile.layout.h }} theme={theme} surface="editor" u={(n) => n * px} today={today} catalog={catalog} />
                <ConnectButton tile={tile} state={states[tile.id]} theme={theme} onConnect={onConnect} />
                {tile.visibility === "private" ? (
                  <span className="tile-private" title="Only you see this tile">
                    <EyeOffIcon size={12} /> Only me
                  </span>
                ) : null}
                <TileTools tile={tile} onChange={onChange} onRemove={onRemove} onDuplicate={onDuplicate} />
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
        {draft.tiles.length === 0 ? (
          <div className="canvas-empty" style={{ borderColor: theme.tileBorder, color: theme.muted }}>
            <p>Your wall is empty. Start with one of these, or pick any tile on the left.</p>
            <div>
              {quickAdd.map((w) => (
                <button key={w.id} type="button" onClick={() => onAdd(w.id)} style={{ background: theme.tile, color: theme.ink, boxShadow: `inset 0 0 0 1px ${theme.tileBorder}` }}>
                  <PlusIcon size={14} /> {w.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function tileLabel(tile: Tile): string {
  const widget = catalog.widget(tile.widget);
  const label = tile.options.label || tile.options.title;
  return `${widget?.name ?? "Tile"}${label ? `: ${String(label)}` : ""}`;
}

/** Hover toolbar, the way Bento and Framer do it: the most common actions without opening anything. */
function TileTools({ tile, onChange, onRemove, onDuplicate }: { tile: Tile; onChange: Props["onChange"]; onRemove: (id: string) => void; onDuplicate: (id: string) => void }) {
  const hidden = tile.visibility === "private";
  return (
    <div className="tile-tools" role="toolbar" aria-label="Tile actions">
      <button
        type="button"
        aria-label={hidden ? "Show on the public page" : "Hide from the public page"}
        title={hidden ? "Show to everyone" : "Only me"}
        onClick={() => onChange((d) => updateTile(d, tile.id, (t) => ({ ...t, visibility: hidden ? "public" : "private" })))}
      >
        {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
      </button>
      <button type="button" aria-label="Duplicate tile" title="Duplicate" onClick={() => onDuplicate(tile.id)}>
        <CopyIcon size={15} />
      </button>
      <span aria-hidden="true" />
      <button type="button" className="danger" aria-label="Delete tile" title="Delete" onClick={() => onRemove(tile.id)}>
        <TrashIcon size={15} />
      </button>
    </div>
  );
}

/** A tile waiting for an account says so on itself, with the button to fix it. */
function ConnectButton({ tile, state, theme, onConnect }: { tile: Tile; state: TileState | undefined; theme: Theme; onConnect: (id: string) => void }) {
  if (state?.status !== "placeholder" || state.reason !== "connect") return null;
  const binding = Object.values(tile.inputs).find((b) => b.kind === "metric");
  const connector = binding?.kind === "metric" ? catalog.connector(binding.connector) : null;
  if (!connector) return null;
  return (
    <button type="button" className="tile-connect" style={{ background: theme.ink, color: theme.page }} onClick={() => onConnect(tile.id)}>
      {hasMark(connector.id) ? <BrandMark id={connector.id} size={14} /> : <KeyIcon size={14} />}
      Connect {connector.name}
    </button>
  );
}
