// Rendered inside the Editor client boundary.
import { useState } from "react";
import { catalog } from "@/plugins/registry";
import { CategoryIcon, PlusIcon, SearchIcon } from "./icons";

const CATEGORIES: { id: string; label: string }[] = [
  { id: "numbers", label: "Numbers" },
  { id: "charts", label: "Charts" },
  { id: "progress", label: "Progress" },
  { id: "time", label: "Time" },
  { id: "content", label: "Content" },
];

/** Every installed widget, by category. Community widgets show up here with nothing else to change. */
export function Library({ onAdd, disabled, limitMessage, count, max }: { onAdd: (widgetId: string) => void; disabled: boolean; limitMessage: string | null; count: number; max: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const widgets = catalog.widgets().filter((w) => !q || `${w.name} ${w.description}`.toLowerCase().includes(q));

  return (
    <div className="ed-library">
      <div className="ed-library-head">
        <h2>Add a tile</h2>
        <span className="ed-meter" title={`${count} of ${max} tiles`}>
          {count}/{max}
        </span>
      </div>
      <label className="ed-search">
        <SearchIcon size={14} />
        <input type="search" placeholder="Search tiles" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tiles" />
      </label>
      {limitMessage ? (
        <p className="ed-callout">
          {limitMessage} <a href="/pricing">Go Pro</a> for up to 60.
        </p>
      ) : null}
      {CATEGORIES.map((cat) => {
        const inCategory = widgets.filter((w) => w.category === cat.id);
        if (!inCategory.length) return null;
        return (
          <section key={cat.id}>
            <h3>{cat.label}</h3>
            <ul className="library">
              {inCategory.map((w) => (
                <li key={w.id}>
                  <button type="button" disabled={disabled} onClick={() => onAdd(w.id)}>
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
