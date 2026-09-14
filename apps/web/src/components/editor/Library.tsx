// Rendered inside the Editor client boundary.
import { catalog } from "@/plugins/registry";

const CATEGORIES: { id: string; label: string }[] = [
  { id: "numbers", label: "Numbers" },
  { id: "charts", label: "Charts" },
  { id: "progress", label: "Progress" },
  { id: "time", label: "Time" },
  { id: "content", label: "Content" },
];

/** Every installed widget, by category. Community widgets show up here with nothing else to change. */
export function Library({ onAdd, disabled, limitMessage }: { onAdd: (widgetId: string) => void; disabled: boolean; limitMessage: string | null }) {
  const widgets = catalog.widgets();
  return (
    <div>
      {limitMessage ? (
        <p className="hint" style={{ marginBottom: 12 }}>
          {limitMessage} <a href="/pricing">Go Pro</a>
        </p>
      ) : null}
      {CATEGORIES.map((cat) => {
        const inCategory = widgets.filter((w) => w.category === cat.id);
        if (!inCategory.length) return null;
        return (
          <section key={cat.id}>
            <h2>{cat.label}</h2>
            <div className="library">
              {inCategory.map((w) => (
                <button key={w.id} type="button" disabled={disabled} onClick={() => onAdd(w.id)}>
                  <strong>{w.name}</strong>
                  <span>{w.description}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
