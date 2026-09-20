// Rendered inside the Editor client boundary.
import { useRef, useState } from "react";
import { TEMPLATES } from "@/domain/templates";
import { WidgetPreview } from "./WidgetPreview";
import { WIDGET_CATEGORIES, type WidgetCategory } from "@flexwall/sdk";
import { canAddTile } from "@/application/editor/store";
import { PAID_TILE_LIMIT } from "@/domain/user";
import { catalog } from "@/plugins/registry";
import { dragIntent } from "@/presentation/editor/pointer-drag";
import { ROUTES } from "@/presentation/routes";
import { useEditor, useEditorActions } from "./EditorContext";
import { useCoarsePointer } from "./WallCanvas";
import { PlusIcon, SearchIcon } from "./icons";

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  numbers: "Numbers",
  charts: "Charts",
  progress: "Progress",
  time: "Time",
  content: "Content",
};

/**
 * Every installed widget, by category: tap or click to add it in the first free
 * spot, or carry it to a cell with a mouse. Pointer events, so a finger and a
 * mouse take the same path. Community widgets show up here with nothing else to change.
 */
export function Library() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"widgets" | "layouts">("widgets");
  const [categoryFilter, setCategoryFilter] = useState<WidgetCategory | "all">("all");
  const count = useEditor((s) => s.draft.tiles.length);
  const { maxTiles, paid } = useEditor((s) => s.entitlements);
  const canAdd = useEditor(canAddTile);
  const actions = useEditorActions();
  const coarse = useCoarsePointer();
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const q = query.trim().toLowerCase();
  const widgets = catalog.widgets().filter((w) => (categoryFilter === "all" || w.category === categoryFilter) && (!q || `${w.name} ${w.description}`.toLowerCase().includes(q)));

  return (
    <div className="ed-library">
      <div className="ed-library-head">
        <h2 title="Click to add, or drag onto the wall">Add a tile</h2>
        <span className="ed-meter" title={`${count} of ${maxTiles} tiles`}>
          {count}/{maxTiles}
        </span>
      </div>
      <div className="ed-library-tabs" aria-label="Library sections">
        <button type="button" aria-pressed={tab === "widgets"} onClick={() => setTab("widgets")}>Widgets</button>
        <button type="button" aria-pressed={tab === "layouts"} onClick={() => setTab("layouts")}>Layouts</button>
      </div>
      <p className="ed-library-intro">{tab === "widgets" ? "Pick a shape. Connect your data next." : "Start with a composition, then make it yours."}</p>
      {tab === "layouts" ? <div className="ed-layout-gallery">
        <p className="ed-note">Applying a layout replaces your tiles. You can undo it.</p>
        {TEMPLATES.map((template) => <button type="button" key={template.id} onClick={() => actions.applyTemplate(template.id)}>
          <span className="ed-layout-mini" aria-hidden="true">{template.tiles.map((tile,i) => <i key={i} style={{ gridColumn: `${tile.layout.x+1} / span ${tile.layout.w}`, gridRow: `${tile.layout.y+1} / span ${tile.layout.h}` }} />)}</span>
          <strong>{template.name}</strong><small>{template.tagline}</small>
        </button>)}
      </div> : <>
      <label className="ed-search">
        <SearchIcon size={14} />
        <input type="search" placeholder="Search tiles" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tiles" />
      </label>
      <div className="ed-category-filter" aria-label="Widget categories">
        {(["all", ...WIDGET_CATEGORIES] as const).map((category) => <button key={category} type="button" aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{category === "all" ? "All" : CATEGORY_LABELS[category]}</button>)}
      </div>
      {canAdd ? null : (
        <p className="ed-callout">
          {paid ? (
            "This wall is full."
          ) : (
            <>
              Free walls hold {maxTiles} tiles. <a href={ROUTES.pricing}>Go Pro</a> for up to {PAID_TILE_LIMIT}.
            </>
          )}
        </p>
      )}
      {WIDGET_CATEGORIES.map((category) => {
        const inCategory = widgets.filter((w) => w.category === category);
        if (!inCategory.length) return null;
        return (
          <section key={category}>
            <h3>{CATEGORY_LABELS[category]}</h3>
            <ul className="library">
              {inCategory.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={!canAdd}
                    aria-label={`Add ${w.name}`}
                    title={`${w.description} ${coarse ? "Tap to add." : "Click to add or drag onto the wall."}`}
                    onClick={() => {
                      // A drag already added the tile where it was dropped.
                      if (dragging.current) return;
                      actions.addTile(w.id);
                    }}
                    onPointerDown={(e) => {
                      if (!canAdd || e.button !== 0) return;
                      start.current = { x: e.clientX, y: e.clientY };
                      dragging.current = false;
                    }}
                    onPointerMove={(e) => {
                      if (!start.current || dragging.current) return;
                      if (dragIntent(start.current, { x: e.clientX, y: e.clientY }, coarse) !== "drag") return;
                      dragging.current = true;
                      actions.startLibraryDrag(w.id);
                    }}
                    onPointerUp={() => {
                      start.current = null;
                      // The wall commits the drop on its own pointerup; this only clears the ghost.
                      if (dragging.current) requestAnimationFrame(() => (dragging.current = false));
                    }}
                    onPointerCancel={() => {
                      start.current = null;
                      dragging.current = false;
                      actions.endLibraryDrag();
                    }}
                  >
                    <WidgetPreview id={w.id} />
                    <span>
                      <strong>{w.name}</strong>
                      <small>{w.description}</small>
                    </span>
                    <span className="ed-plus" aria-hidden="true">
                      <PlusIcon size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {widgets.length === 0 ? <p className="ed-note">No tile matches “{query}”.</p> : null}
      </>}
    </div>
  );
}
