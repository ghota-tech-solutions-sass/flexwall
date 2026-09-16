import type { ConnectorDef } from "./connector";
import { themeProblems, type Theme } from "./theme";
import type { WidgetDef } from "./widget";

/**
 * A plugin is a folder under `plugins/` exporting one `definePlugin(...)`.
 * It can contribute connectors, widgets and themes, in any combination.
 */
export interface PluginDef {
  /** Unique, matches the folder name. */
  id: string;
  name: string;
  description: string;
  author: { name: string; url?: string };
  /** Where issues go. */
  repository?: string;
  connectors?: ConnectorDef[];
  // Widgets are generic over their options; the registry only needs the erased shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  widgets?: WidgetDef<any>[];
  themes?: Theme[];
}

export function definePlugin(def: PluginDef): PluginDef {
  return def;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks a set of plugins for the mistakes that would break a wall at runtime:
 * duplicate or malformed ids, samples missing a metric, impossible sizes.
 * The host runs this at startup and in tests; plugin authors run it via `testing`.
 */
export function checkPlugins(plugins: readonly PluginDef[]): string[] {
  const problems: string[] = [];
  const seen = { plugin: new Set<string>(), connector: new Set<string>(), widget: new Set<string>(), theme: new Set<string>() };
  const once = (kind: keyof typeof seen, id: string, where: string) => {
    if (!ID.test(id)) problems.push(`${where}: id "${id}" must be lowercase letters, digits and dashes`);
    if (seen[kind].has(id)) problems.push(`${where}: ${kind} id "${id}" is already taken`);
    seen[kind].add(id);
  };
  for (const p of plugins) {
    once("plugin", p.id, `plugin ${p.id}`);
    for (const c of p.connectors ?? []) {
      const where = `plugin ${p.id}, connector ${c.id}`;
      once("connector", c.id, where);
      if (c.metrics.length === 0) problems.push(`${where}: declares no metrics`);
      for (const m of c.metrics) {
        const sample = c.sample[m.id];
        if (!sample) problems.push(`${where}: no sample for metric "${m.id}"`);
        else if (sample.type !== m.type) problems.push(`${where}: sample for "${m.id}" is ${sample.type}, metric says ${m.type}`);
      }
      if (c.auth && !c.connect && !c.auth.oauth) problems.push(`${where}: has auth fields but no connect()`);
      if (c.auth?.oauth && c.connect) problems.push(`${where}: has both oauth and connect(), pick one`);
      if (!c.auth && c.verified) problems.push(`${where}: verified connectors need auth, the badge means "from the owner's own account"`);
      if (c.ttl < 60) problems.push(`${where}: ttl under 60 seconds would hammer the upstream`);
      if (c.serverCost !== undefined) {
        if (c.serverCost !== "per-account") problems.push(`${where}: serverCost can only be "per-account"`);
        if (!c.auth) problems.push(`${where}: a per-account cost is paid per connection, so connectors with serverCost need auth`);
      }
    }
    for (const w of p.widgets ?? []) {
      const where = `plugin ${p.id}, widget ${w.id}`;
      once("widget", w.id, where);
      const { min, max, default: d } = w.size;
      const fits = (s: readonly number[]) => s[0] >= min[0] && s[1] >= min[1] && s[0] <= max[0] && s[1] <= max[1];
      if (max[0] > 4) problems.push(`${where}: max width is 4 cells`);
      if (!fits(d)) problems.push(`${where}: default size is outside min/max`);
      const keys = new Set<string>();
      for (const f of [...w.inputs.map((i) => ({ key: i.key })), ...w.options]) {
        if (keys.has(f.key)) problems.push(`${where}: "${f.key}" is used twice between inputs and options`);
        keys.add(f.key);
      }
    }
    for (const t of p.themes ?? []) {
      const where = `plugin ${p.id}, theme ${t.id}`;
      once("theme", t.id, where);
      for (const problem of themeProblems(t)) problems.push(`${where}: ${problem}`);
    }
  }
  return problems;
}
