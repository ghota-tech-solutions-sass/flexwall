// Rendered inside the Editor client boundary.
import { useState } from "react";
import { WIDGET_CATEGORIES, type WidgetCategory } from "@flexwall/sdk";
import { canAddTile } from "@/application/editor/store";
import { PAID_TILE_LIMIT } from "@/domain/user";
import { catalog } from "@/plugins/registry";
import { ROUTES } from "@/presentation/routes";
import { useEditor, useEditorActions } from "./EditorContext";
import { CategoryIcon, PlusIcon, SearchIcon } from "./icons";

/** What a library item carries while dragged, so a drop elsewhere can't be mistaken for one. */
export const LIBRARY_DRAG_TYPE = "application/x-flexwall-widget";

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  numbers: "Numbers",
  charts: "Charts",
  progress: "Progress",
  time: "Time",
  content: "Content",
};

/** Every installed widget, by category: click to add it in the first free spot, or drag it where it goes. Community widgets show up here with nothing else to change. */
export function Library() {
  const [query, setQuery] = useState("");
  const count = useEditor((s) => s.draft.tiles.length);
  const { maxTiles, paid } = useEditor((s) => s.entitlements);
  const canAdd = useEditor(canAddTile);
  const actions = useEditorActions();

  const q = query.trim().toLowerCase();
  const widgets = catalog.widgets().filter((w) => !q || `${w.name} ${w.description}`.toLowerCase().includes(q));

  return (
    <div className="ed-library">
      <div className="ed-library-head">
        <h2 title="Click to add, or drag onto the wall">Add a tile</h2>
        <span className="ed-meter" title={`${count} of ${maxTiles} tiles`}>
          {count}/{maxTiles}
        </span>
      </div>
      <label className="ed-search">
        <SearchIcon size={14} />
        <input type="search" placeholder="Search tiles" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tiles" />
      </label>
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
                    draggable={canAdd}
                    title="Click to add, or drag onto the wall"
                    onClick={() => actions.addTile(w.id)}
                    onDragStart={(e) => {
                      // Firefox starts a drag only with data set.
                      e.dataTransfer.setData(LIBRARY_DRAG_TYPE, w.id);
                      e.dataTransfer.setData("text/plain", w.name);
                      e.dataTransfer.effectAllowed = "copy";
                      actions.startLibraryDrag(w.id);
                    }}
                    onDragEnd={() => actions.endLibraryDrag()}
                  >
                    <span className="ed-glyph small">
                      <CategoryIcon category={w.category} size={15} />
                    </span>
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
    </div>
  );
}
