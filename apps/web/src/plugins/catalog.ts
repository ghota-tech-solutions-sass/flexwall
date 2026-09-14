import { checkPlugins, type ConnectorDef, type PluginDef, type Theme, type WidgetDef } from "@flexwall/sdk";
import type { BrowsableCatalog } from "@/domain/catalog";

export type { BrowsableCatalog };

/** Indexes a list of plugins. Throws on the mistakes `checkPlugins` finds, so a broken plugin fails at startup. */
export function createCatalog(plugins: readonly PluginDef[], defaultThemeId: string): BrowsableCatalog {
  const problems = checkPlugins(plugins);
  if (problems.length) throw new Error(`Plugin problems:\n- ${problems.join("\n- ")}`);

  const connectors = new Map<string, ConnectorDef>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widgets = new Map<string, WidgetDef<any>>();
  const themes = new Map<string, Theme>();
  for (const p of plugins) {
    for (const c of p.connectors ?? []) connectors.set(c.id, c);
    for (const w of p.widgets ?? []) widgets.set(w.id, w);
    for (const t of p.themes ?? []) themes.set(t.id, t);
  }
  const fallback = themes.get(defaultThemeId);
  if (!fallback) throw new Error(`Default theme "${defaultThemeId}" isn't installed`);

  return {
    widget: (id) => widgets.get(id) ?? null,
    connector: (id) => connectors.get(id) ?? null,
    metric: (connector, metric) => connectors.get(connector)?.metrics.find((m) => m.id === metric) ?? null,
    theme: (id) => themes.get(id) ?? null,
    defaultTheme: () => fallback,
    connectors: () => [...connectors.values()],
    widgets: () => [...widgets.values()],
    themes: () => [...themes.values()],
  };
}
