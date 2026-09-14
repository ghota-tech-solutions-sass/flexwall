// Rendered inside the Editor client boundary.
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GAP_UNITS, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { WALL_COLUMNS } from "@/domain/layout";
import type { WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { TileBody } from "@/rendering/tile";
import { applyLayout } from "./editor-model";

interface Props {
  draft: WallDraft;
  states: Record<string, TileState>;
  theme: Theme;
  today: string;
  selected: string | null;
  onSelect: (id: string) => void;
  onChange: (next: (d: WallDraft) => WallDraft) => void;
}

/** The wall grid, draggable and resizable. Sizes come from each widget's declared min and max. */
export function WallCanvas({ draft, states, theme, today, selected, onSelect, onChange }: Props) {
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
    <div className="canvas-frame" style={{ background: theme.page }}>
      <header style={{ color: theme.ink, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontFamily: theme.display.family, fontWeight: theme.display.weight, fontSize: 34 }}>{draft.title || "Untitled wall"}</h1>
        {draft.bio ? <p style={{ color: theme.muted, margin: "6px 0 0" }}>{draft.bio}</p> : null}
      </header>
      <div ref={containerRef}>
        {mounted && width > 0 ? (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: WALL_COLUMNS, rowHeight: cell, margin: [gap, gap], containerPadding: [0, 0] }}
            compactor={verticalCompactor}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            // Commit on stop too: onLayoutChange can be skipped when a drag ends outside the grid.
            onLayoutChange={(next) => onChange((d) => applyLayout(d, next))}
            onDragStop={(next) => onChange((d) => applyLayout(d, next))}
            onResizeStop={(next) => onChange((d) => applyLayout(d, next))}
          >
            {draft.tiles.map((tile) => (
              <div key={tile.id} className={`grid-item${selected === tile.id ? " selected" : ""}`} onMouseDown={() => onSelect(tile.id)}>
                <TileBody
                  tile={tile}
                  state={states[tile.id]}
                  box={{ w: tile.layout.w, h: tile.layout.h }}
                  theme={theme}
                  surface="editor"
                  u={(n) => n * px}
                  today={today}
                  catalog={catalog}
                />
                {tile.visibility === "private" ? (
                  <span className="badge quiet" style={{ position: "absolute", top: 8, right: 8 }}>
                    Private
                  </span>
                ) : null}
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
        {draft.tiles.length === 0 ? <p style={{ color: theme.muted }}>Add a tile from the left to start your wall.</p> : null}
      </div>
    </div>
  );
}
