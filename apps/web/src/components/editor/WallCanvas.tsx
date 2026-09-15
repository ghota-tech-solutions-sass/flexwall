// Rendered inside the Editor client boundary.
import { useState } from "react";
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { CELL_UNITS, GAP_UNITS, gridUnits, themeBackground, type Size, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { dropCell, tileConnections, tileName } from "@/application/editor/draft";
import { editorTheme } from "@/application/editor/state";
import { WALL_COLUMNS } from "@/domain/layout";
import { BIO_MAX, TITLE_MAX, type Tile } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { ConnectionTitle } from "@/components/connections/ConnectionTitle";
import { displayNameText } from "@/domain/connection";
import { TileBody } from "@/rendering/tile";
import { useConnectionNames, useEditor, useEditorActions } from "./EditorContext";
import { CopyIcon, EyeIcon, EyeOffIcon, KeyIcon, PlusIcon, TrashIcon } from "./icons";

/** Controls drawn on a tile. Pointer events on them never start a drag. */
const NO_DRAG = ".tile-tools, .tile-connect";

/** Resize limits for a tile whose widget is gone: one cell up to the full width. */
const FALLBACK_SIZE: { min: Size; max: Size } = { min: [1, 1], max: [WALL_COLUMNS, WALL_COLUMNS] };

/** Offered on an empty wall, in this order, when installed. */
const QUICK_ADD_WIDGETS = ["stat", "sparkline", "note"] as const;

export function useEditorTheme(): Theme {
  return useEditor((s) => editorTheme(s, catalog));
}

/** The wall grid, draggable and resizable. Sizes come from each widget's declared min and max. */
export function WallCanvas() {
  const theme = useEditorTheme();
  const title = useEditor((s) => s.draft.title);
  const bio = useEditor((s) => s.draft.bio);
  const tiles = useEditor((s) => s.draft.tiles);
  const states = useEditor((s) => s.states);
  const today = useEditor((s) => s.today);
  const selected = useEditor((s) => s.selected);
  const libraryDrag = useEditor((s) => s.libraryDrag);
  const actions = useEditorActions();
  const [dropAt, setDropAt] = useState<{ x: number; y: number } | null>(null);
  const dragged = libraryDrag ? catalog.widget(libraryDrag) : null;
  const [dropW, dropH] = dragged?.size.default ?? [1, 1];

  const { width, containerRef, mounted } = useContainerWidth();
  const px = width / gridUnits(WALL_COLUMNS);
  const pitch = (CELL_UNITS + GAP_UNITS) * px;

  /**
   * Drops are handled here rather than by the grid: the grid's own drop keeps
   * a layout of its own that fights the wall's. The spot follows the pointer;
   * the tile lands on release, and the grid only sees the new wall.
   */
  const cellUnder = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // The pointer holds the tile by its middle, the way it looks while dragging.
    const point = { x: e.clientX - rect.left - ((dropW - 1) * pitch) / 2, y: e.clientY - rect.top - ((dropH - 1) * pitch) / 2 };
    return dropCell(point, { cell: CELL_UNITS * px, gap: GAP_UNITS * px, columns: WALL_COLUMNS }, dropW);
  };
  const dropHandlers = {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragged) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const cell = cellUnder(e);
      if (cell.x !== dropAt?.x || cell.y !== dropAt?.y) setDropAt(cell);
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragged) return;
      e.preventDefault();
      setDropAt(null);
      actions.dropTile(dragged.id, cellUnder(e));
    },
  };

  const layout: Layout = tiles.map((t) => {
    const size = catalog.widget(t.widget)?.size ?? FALLBACK_SIZE;
    const [minW, minH] = size.min;
    const [maxW, maxH] = size.max;
    return { i: t.id, ...t.layout, minW, minH, maxW, maxH };
  });

  return (
    <div className="canvas-frame" style={{ ...themeBackground(theme), color: theme.ink, colorScheme: theme.mode }}>
      <header className="canvas-head">
        <input
          className="canvas-title"
          aria-label="Wall title"
          placeholder="Your name or project"
          value={title}
          maxLength={TITLE_MAX}
          style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight, color: theme.ink }}
          onChange={(e) => actions.setTitle(e.target.value)}
        />
        <textarea className="canvas-bio" aria-label="Bio" placeholder="Add a short bio: what you build, for whom." rows={1} value={bio} maxLength={BIO_MAX} style={{ color: theme.muted }} onChange={(e) => actions.setBio(e.target.value)} />
      </header>
      <div ref={containerRef} className={dragged ? "canvas-grid dropping" : "canvas-grid"} {...dropHandlers}>
        {dragged && dropAt ? (
          <div
            className="canvas-drop-spot"
            aria-hidden="true"
            style={{
              left: dropAt.x * pitch,
              top: dropAt.y * pitch,
              width: gridUnits(dropW) * px,
              height: gridUnits(dropH) * px,
              borderColor: theme.accent,
              background: theme.accent,
            }}
          />
        ) : null}
        {mounted && width > 0 ? (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: WALL_COLUMNS, rowHeight: CELL_UNITS * px, margin: [GAP_UNITS * px, GAP_UNITS * px], containerPadding: [0, 0] }}
            compactor={verticalCompactor}
            dragConfig={{ cancel: NO_DRAG }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            // Commit on stop too: onLayoutChange can be skipped when a drag ends outside the grid.
            onLayoutChange={actions.moveTiles}
            onDragStop={actions.moveTiles}
            onResizeStop={actions.moveTiles}
          >
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className={`grid-item${selected === tile.id ? " selected" : ""}${tile.visibility === "private" ? " private" : ""}`}
                tabIndex={0}
                aria-label={tileName(tile, catalog)}
                onMouseDown={() => actions.select(tile.id)}
                onFocus={(e) => e.target === e.currentTarget && actions.select(tile.id)}
              >
                <TileBody tile={tile} state={states[tile.id]} box={{ w: tile.layout.w, h: tile.layout.h }} theme={theme} surface="editor" u={(n) => n * px} today={today} catalog={catalog} />
                <ConnectButton tile={tile} state={states[tile.id]} theme={theme} />
                {tile.visibility === "private" ? (
                  <span className="tile-private" title="Only you see this tile">
                    <EyeOffIcon size={12} /> Only me
                  </span>
                ) : null}
                <TileTools tile={tile} />
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
        {tiles.length === 0 ? <EmptyWall theme={theme} /> : null}
      </div>
    </div>
  );
}

function EmptyWall({ theme }: { theme: Theme }) {
  const actions = useEditorActions();
  const suggestions = QUICK_ADD_WIDGETS.flatMap((id) => catalog.widget(id) ?? []);
  return (
    <div className="canvas-empty" style={{ borderColor: theme.tileBorder, color: theme.muted }}>
      <p>Your wall is empty. Start with one of these, or pick any tile on the left.</p>
      <div>
        {suggestions.map((w) => (
          <button key={w.id} type="button" onClick={() => actions.addTile(w.id)} style={{ background: theme.tile, color: theme.ink, boxShadow: `inset 0 0 0 1px ${theme.tileBorder}` }}>
            <PlusIcon size={14} /> {w.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hover toolbar, the way Bento and Framer do it: the most common actions without opening anything. */
function TileTools({ tile }: { tile: Tile }) {
  const actions = useEditorActions();
  const connections = useEditor((s) => s.connections);
  const names = useConnectionNames();
  const hidden = tile.visibility === "private";
  const feeding = tileConnections(tile).flatMap((id) => {
    const connection = connections.find((c) => c.id === id);
    return connection ? [{ connection, shown: names[id] }] : [];
  });
  const first = feeding[0];
  return (
    <div className="tile-tools" role="toolbar" aria-label="Tile actions">
      {first ? (
        <>
          <small aria-label={`From ${feeding.map((f) => displayNameText(f.shown ?? { name: f.connection.label, number: null })).join(", ")}`}>
            {hasMark(first.connection.connector) ? <BrandMark id={first.connection.connector} size={12} /> : <KeyIcon size={12} />}
            <ConnectionTitle shown={first.shown} fallback={first.connection.label} />
            {feeding.length > 1 ? <i>+{feeding.length - 1}</i> : null}
          </small>
          <span aria-hidden="true" />
        </>
      ) : null}
      <button type="button" aria-label={hidden ? "Show on the public page" : "Hide from the public page"} title={hidden ? "Show to everyone" : "Only me"} onClick={() => actions.setVisibility(tile.id, hidden ? "public" : "private")}>
        {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
      </button>
      <button type="button" aria-label="Duplicate tile" title="Duplicate" onClick={() => actions.duplicateTile(tile.id)}>
        <CopyIcon size={15} />
      </button>
      <span aria-hidden="true" />
      <button type="button" className="danger" aria-label="Delete tile" title="Delete" onClick={() => actions.removeTile(tile.id)}>
        <TrashIcon size={15} />
      </button>
    </div>
  );
}

/** A tile waiting for an account says so on itself, with the button to fix it. */
function ConnectButton({ tile, state, theme }: { tile: Tile; state: TileState | undefined; theme: Theme }) {
  const actions = useEditorActions();
  if (state?.status !== "placeholder" || state.reason !== "connect") return null;
  const binding = Object.values(tile.inputs).find((b) => b.kind === "metric");
  const connector = binding?.kind === "metric" ? catalog.connector(binding.connector) : null;
  if (!connector) return null;
  return (
    <button type="button" className="tile-connect" style={{ background: theme.ink, color: theme.page }} onClick={() => actions.requestConnect(tile.id)}>
      {hasMark(connector.id) ? <BrandMark id={connector.id} size={14} /> : <KeyIcon size={14} />}
      Connect {connector.name}
    </button>
  );
}
