import type { Metric, WallConfig } from "@/lib/config";
import { CATALOG, CONNECTOR_IDS, connectorSpec, metricSpec, type ConnectorSpec } from "@/lib/connectors/catalog";
import type { WallView } from "@/lib/site";

/**
 * The "Shows" menu, built from the catalog: a new connector shows up here
 * without touching the editor. Option values are "local:<kind>" or
 * "connector:<source>:<field>".
 */

export interface OptionGroup {
  label: string;
  pro: boolean;
  options: { value: string; label: string }[];
}

const LOCAL_OPTIONS = [
  { value: "local:goal", label: "Goal with a progress bar" },
  { value: "local:number", label: "Plain number" },
  { value: "local:countdown", label: "Countdown to a date" },
  { value: "local:year-progress", label: "How much of the year is gone" },
];

export const OPTION_GROUPS: OptionGroup[] = [
  { label: "Typed by you", pro: false, options: LOCAL_OPTIONS },
  ...CONNECTOR_IDS.map((id) => {
    const spec: ConnectorSpec = CATALOG[id];
    return {
      label: spec.pro ? `${spec.label} (Pro)` : spec.label,
      pro: spec.pro,
      options: spec.metrics.map((m) => ({ value: `connector:${id}:${m.id}`, label: `${spec.label}: ${m.label}` })),
    };
  }),
];

export function optionValue(metric: Metric): string {
  return metric.kind === "connector" ? `connector:${metric.source}:${metric.field}` : `local:${metric.kind}`;
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Params a new connector metric can borrow from what the owner already typed elsewhere. */
function knownParams(config: WallConfig): Record<string, string> {
  const known: Record<string, string> = {};
  for (const m of [config.hero, ...config.stats]) if (m.kind === "connector") Object.assign(known, m.params);
  if (config.heatmap && !known.user) known.user = config.heatmap;
  return known;
}

export function metricFromOption(value: string, config: WallConfig, wall: WallView | null): Metric {
  const [type, a, b] = value.split(":");
  if (type === "local") {
    switch (a) {
      case "goal":
        return { kind: "goal", label: "MRR", current: 0, target: 1000, prefix: "$", suffix: "" };
      case "number":
        return { kind: "number", label: "", value: 0, prefix: "", suffix: "" };
      case "countdown":
        return { kind: "countdown", label: "until launch", date: inDays(30) };
      default:
        return { kind: "year-progress" };
    }
  }
  const spec = metricSpec(a, b)!;
  const connector = connectorSpec(a)!;
  const known = knownParams(config);
  const params = Object.fromEntries(spec.params.map((p) => [p.name, known[p.name] ?? ""]));
  const connection = connector.connection ? (wall?.connections.find((c) => c.source === a) ?? null) : null;
  return {
    kind: "connector",
    source: a,
    field: b,
    params,
    connection: connection?.id ?? "",
    label: spec.defaults.label,
    // A connected account knows its currency better than the catalog's default.
    prefix: spec.defaults.prefix === "$" && connection?.public.symbol ? connection.public.symbol : spec.defaults.prefix,
    suffix: spec.defaults.suffix,
  };
}
