import type { ConnectorMetric, Metric, WallConfig } from "@/lib/config";
import { connectorSpec, metricSpec } from "@/lib/connectors/catalog";
import { getConnector } from "@/lib/connectors/registry";
import type { ConnectionData, Connector, Values } from "@/lib/connectors/types";
import { decryptJson } from "@/lib/crypto";
import { getGithubStats, shiftDate, type ContributionDay } from "@/lib/sources/github";
import { saveCachedValues, type CachedValues, type Wall } from "@/lib/store/walls";

/** What the renderer draws for one metric: already formatted, no data fetching left. */
export interface Display {
  value: string;
  label: string;
  /** Right of the value, smaller: "/ $10k". */
  of?: string;
  /** 0–1, draws a bar. */
  progress?: number;
}

export interface Resolved {
  hero: Display;
  stats: Display[];
  heatmap: ContributionDay[] | null;
}

/**
 * Who is looking decides what connectors may do:
 *  - phone:     the Shortcut's image. Pro connectors need a Pro wall.
 *  - owner:     the editor preview, edit key checked. Everything runs, so people see what Pro gets them.
 *  - anonymous: an unsaved config. Public connectors only, there are no connections yet.
 *  - sample:    marketing images. Nothing is fetched, connectors return their sample numbers.
 */
export type ResolveMode = "phone" | "owner" | "anonymous" | "sample";

export interface ResolveInput {
  config: WallConfig;
  mode: ResolveMode;
  wall?: Wall | null;
  now?: Date;
}

/** Today's date (YYYY-MM-DD) in the owner's zone. */
export function todayIn(tz: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim(n / 1e9) + "B";
  if (abs >= 1e6) return trim(n / 1e6) + "M";
  if (abs >= 1e5) return Math.round(n / 1e3) + "k";
  return Math.round(n).toLocaleString("en-US");
}

/** Short form for the "/ target" part, where space is tight. */
export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e3 && Math.abs(n) < 1e5) return trim(n / 1e3) + "k";
  return formatAmount(n);
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86_400_000);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function numberDisplay(n: number, m: { label: string; prefix: string; suffix: string; target?: number }): Display {
  const d: Display = { value: m.prefix + formatAmount(n) + m.suffix, label: m.label };
  if (m.target) {
    d.of = "/ " + m.prefix + formatCompact(m.target) + m.suffix;
    d.progress = Math.max(0, Math.min(1, n / m.target));
  }
  return d;
}

/** Metrics that need nothing but the config and a date. */
export function resolveLocal(metric: Exclude<Metric, ConnectorMetric>, today: string): Display {
  switch (metric.kind) {
    case "countdown": {
      // The label is the owner's phrase ("until launch"); the unit is ours.
      const d = daysBetween(today, metric.date);
      const what = metric.label || "to go";
      if (d === 0) return { value: "Today", label: what };
      const unit = Math.abs(d) === 1 ? "day" : "days";
      if (d > 0) return { value: String(d), label: `${unit} ${what}` };
      return { value: `+${-d}`, label: `${unit} past · ${what}` };
    }
    case "year-progress": {
      const year = Number(today.slice(0, 4));
      const dayOfYear = daysBetween(`${year}-01-01`, today) + 1;
      const p = dayOfYear / (isLeap(year) ? 366 : 365);
      return { value: `${Math.floor(p * 100)}%`, label: `of ${year} gone`, progress: p };
    }
    case "goal":
      return numberDisplay(metric.current, metric);
    case "number":
      return numberDisplay(metric.value, metric);
  }
}

// ── Connector values: cache, stale fallback, one flight per key ──────

const TTL_FLOOR_MS = 60_000;
const g = globalThis as unknown as { __fwValues?: Map<string, CachedValues>; __fwFlights?: Map<string, Promise<Values>> };
const memoryValues = (g.__fwValues ??= new Map());
const flights = (g.__fwFlights ??= new Map());

/** Where a set of values is cached. Starts with source and connection so a deleted connection can purge its entries. */
export function valueCacheKey(source: string, connectionId: string, connectorKey: string): string {
  return `${source}|${connectionId || "-"}|${connectorKey}`;
}

export function cacheKeysForConnection(wall: Pick<Wall, "valueCache">, source: string, connectionId: string): string[] {
  const prefix = `${source}|${connectionId}|`;
  return Object.keys(wall.valueCache ?? {}).filter((k) => k.startsWith(prefix));
}

async function valuesFor(connector: Connector, metric: ConnectorMetric, connection: ConnectionData | null, wall: Wall | null, today: string): Promise<Values> {
  const key = valueCacheKey(metric.source, metric.connection, connector.cacheKey(metric));
  const now = Date.now();
  const ttl = Math.max(TTL_FLOOR_MS, connector.ttlMs);
  const known = [memoryValues.get(key), wall?.valueCache?.[key]].filter(Boolean).sort((a, b) => b!.at - a!.at)[0];
  if (known && now - known.at < ttl) return known.values;

  let flight = flights.get(key);
  if (!flight) {
    flight = connector
      .fetch({ field: metric.field, params: metric.params, connection, today })
      .then((values) => {
        const entry = { at: Date.now(), values };
        memoryValues.set(key, entry);
        if (wall) saveCachedValues(wall.id, key, entry).catch((error) => console.error("value cache write failed:", error));
        return values;
      })
      .finally(() => flights.delete(key));
    flights.set(key, flight);
  }
  try {
    return await flight;
  } catch (error) {
    // Yesterday's number beats a dash: the phone can't tell anyone the API was down.
    if (known) {
      console.error(`${key}: refresh failed, serving values from ${new Date(known.at).toISOString()}:`, (error as Error).message);
      return known.values;
    }
    throw error;
  }
}

async function resolveConnector(metric: ConnectorMetric, input: ResolveInput, today: string): Promise<Display> {
  const spec = connectorSpec(metric.source);
  const connector = getConnector(metric.source);
  const label = metric.label || metricSpec(metric.source, metric.field)?.label || metric.field;
  if (!spec || !connector) return { value: "–", label };

  if (input.mode === "sample") return numberDisplay(connector.sample(metric.field), metric);
  if (spec.pro && input.mode === "phone" && !input.wall?.pro) return { value: "–", label: `${label} · needs Pro` };

  const stored = spec.connection ? input.wall?.connections?.[metric.connection] : undefined;
  if (spec.connection && (!stored || stored.source !== metric.source || input.mode === "anonymous")) {
    return { value: "–", label: `connect ${spec.label}` };
  }

  try {
    // Inside the try: a rotated encryption key must degrade to a dash, not a 500.
    const connection: ConnectionData | null = stored ? { secret: decryptJson<Record<string, string>>(stored.sealed), public: stored.public } : null;
    const values = await valuesFor(connector, metric, connection, input.wall ?? null, today);
    const n = values[metric.field];
    return n === null || n === undefined ? { value: "–", label } : numberDisplay(n, metric);
  } catch (error) {
    console.error(`${metric.source}.${metric.field} failed:`, (error as Error).message);
    return { value: "–", label: `${spec.label} unreachable` };
  }
}

export function resolveMetric(metric: Metric, input: ResolveInput, today: string): Promise<Display> {
  return metric.kind === "connector" ? resolveConnector(metric, input, today) : Promise.resolve(resolveLocal(metric, today));
}

/**
 * Plausible contribution history for marketing samples, so the landing page
 * never puts a real person's GitHub on show. Deterministic per date.
 */
export function sampleContributions(today: string): ContributionDay[] {
  const days: ContributionDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const x = Math.sin(Number(date.replace(/-/g, "")) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const weekend = [0, 6].includes(new Date(date + "T00:00:00Z").getUTCDay());
    const count = r < (weekend ? 0.45 : 0.12) ? 0 : Math.floor(r * (weekend ? 5 : 14));
    days.push({ date, count, level: count === 0 ? 0 : Math.min(4, 1 + Math.floor(count / 4)) });
  }
  // A clean recent run: the streak is the point of the sample.
  for (let i = 0; i < 47; i++) {
    const d = days[days.length - 1 - i];
    if (d.count === 0) Object.assign(d, { count: 3, level: 1 });
  }
  return days;
}

async function heatmapFor(input: ResolveInput, today: string): Promise<ContributionDay[] | null> {
  const user = input.config.heatmap;
  if (!user) return null;
  if (input.mode === "sample") return sampleContributions(today);
  const stats = await getGithubStats(user, today);
  return stats ? stats.days.filter((d) => d.date <= today) : null;
}

export async function resolveWall(input: ResolveInput): Promise<Resolved> {
  const today = todayIn(input.config.tz, input.now ?? new Date());
  const [hero, stats, heatmap] = await Promise.all([
    resolveMetric(input.config.hero, input, today),
    Promise.all(input.config.stats.map((m) => resolveMetric(m, input, today))),
    heatmapFor(input, today),
  ]);
  return { hero, stats, heatmap };
}
