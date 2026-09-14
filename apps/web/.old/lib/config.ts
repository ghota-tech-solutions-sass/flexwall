import { z } from "zod";
import { checkFields, connectorSpec, metricSpec } from "@/lib/connectors/catalog";

/**
 * A wallpaper is a small JSON config. Everything the renderer draws comes from
 * here plus whatever public data the metrics fetch (GitHub). No user secrets.
 */

/** Lock screen pixel sizes. `w`/`h` are device pixels; the renderer scales a 402pt-wide design. */
export const DEVICES = {
  "iphone-17-pro": { label: "iPhone 17 Pro · 17 · 16 Pro", w: 1206, h: 2622 },
  "iphone-17-pro-max": { label: "iPhone 17 Pro Max · 16 Pro Max", w: 1320, h: 2868 },
  "iphone-air": { label: "iPhone Air", w: 1260, h: 2736 },
  "iphone-16": { label: "iPhone 16 · 15 · 15 Pro · 14 Pro", w: 1179, h: 2556 },
  "iphone-16-plus": { label: "iPhone 16 Plus · 15 Plus · 15 Pro Max · 14 Pro Max", w: 1290, h: 2796 },
  "iphone-14": { label: "iPhone 14 · 13 · 12", w: 1170, h: 2532 },
  android: { label: "Android (1080 × 2400)", w: 1080, h: 2400 },
} as const;
export type DeviceId = keyof typeof DEVICES;
export const DEVICE_IDS = Object.keys(DEVICES) as [DeviceId, ...DeviceId[]];

/** `tone` is the color the iOS clock will pick over the theme; `swatch` is the editor's chip. */
export const THEMES = {
  ink: { label: "Ink", pro: false, tone: "light", swatch: "linear-gradient(180deg,#0a0a0b,#1c1c1f)" },
  paper: { label: "Paper", pro: false, tone: "dark", swatch: "linear-gradient(90deg,#eeeae1 70%,#e0482a 70%)" },
  gold: { label: "Old Money", pro: true, tone: "light", swatch: "linear-gradient(90deg,#173026 70%,#c9a45c 70%)" },
  terminal: { label: "Terminal", pro: true, tone: "light", swatch: "linear-gradient(90deg,#040705 70%,#7dff9e 70%)" },
  sunset: { label: "Sunset", pro: true, tone: "light", swatch: "linear-gradient(135deg,#ff7a3d,#ff2d6f 50%,#5a2dff)" },
  serif: { label: "Editorial", pro: true, tone: "dark", swatch: "linear-gradient(90deg,#f5f1e8 70%,#121110 70%)" },
} as const;
export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as [ThemeId, ...ThemeId[]];

const label = z.string().trim().max(32);
const affix = z.string().trim().max(4).default("");
const ghUser = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, "invalid GitHub username");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const amount = z.number().min(0).max(1e12);

/**
 * A number that comes from a connector (src/lib/connectors). The config only
 * names where the number lives: source, field, public params, and for
 * connectors with credentials the id of a connection stored server-side.
 * Never a secret: configs travel in request bodies and previews.
 */
const ConnectorMetricSchema = z
  .object({
    kind: z.literal("connector"),
    source: z.string().max(32),
    field: z.string().max(32),
    params: z.record(z.string().max(32), z.string().max(200)).default({}),
    connection: z.string().max(32).default(""),
    label,
    prefix: affix,
    suffix: affix,
    /** Turns the number into a goal with a progress bar. */
    target: amount.positive().optional(),
  })
  .superRefine((m, ctx) => {
    const spec = metricSpec(m.source, m.field);
    if (!spec) {
      ctx.addIssue({ code: "custom", message: `unknown metric ${m.source}.${m.field}` });
      return;
    }
    const problem = checkFields(spec.params, m.params);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["params"] });
  });

export const MetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("countdown"), label, date: isoDate }),
  z.object({ kind: z.literal("goal"), label, current: amount, target: amount.positive(), prefix: affix, suffix: affix }),
  z.object({ kind: z.literal("number"), label, value: amount, prefix: affix, suffix: affix }),
  z.object({ kind: z.literal("year-progress") }),
  ConnectorMetricSchema,
]);
export type Metric = z.infer<typeof MetricSchema>;
export type ConnectorMetric = Extract<Metric, { kind: "connector" }>;
export type MetricKind = Metric["kind"];

export const WallConfigSchema = z.object({
  device: z.enum(DEVICE_IDS).default("iphone-17-pro"),
  theme: z.enum(THEME_IDS).default("ink"),
  /** Small line above the hero, e.g. "@mickael · building in public". */
  caption: z.string().trim().max(40).default(""),
  hero: MetricSchema,
  stats: z.array(MetricSchema).max(3).default([]),
  /** GitHub username whose last weeks of contributions are drawn as a heatmap. */
  heatmap: ghUser.or(z.literal("")).default(""),
  /** IANA zone of the phone: "today" for countdowns is the owner's today, not the server's. */
  tz: z.string().max(64).refine(isTimeZone, "unknown time zone").default("UTC"),
});
export type WallConfig = z.infer<typeof WallConfigSchema>;

export const DEFAULT_CONFIG: WallConfig = {
  device: "iphone-17-pro",
  theme: "ink",
  caption: "building in public",
  hero: { kind: "goal", label: "MRR", current: 1240, target: 10000, prefix: "$", suffix: "" },
  stats: [
    { kind: "countdown", label: "until launch", date: nextMonthIso() },
    { kind: "year-progress" },
  ],
  heatmap: "",
  tz: "UTC",
};

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function nextMonthIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

/** Parses untrusted input into a config, or null. */
export function parseConfig(input: unknown): WallConfig | null {
  const r = WallConfigSchema.safeParse(input);
  return r.success ? r.data : null;
}

/** Pro-only choices present in a config (empty when a free wall can render it as is). */
export function proFeaturesUsed(config: WallConfig): string[] {
  const used: string[] = [];
  if (THEMES[config.theme].pro) used.push(`theme:${config.theme}`);
  for (const m of [config.hero, ...config.stats]) {
    if (m.kind === "connector" && connectorSpec(m.source)?.pro) used.push(`connector:${m.source}`);
  }
  return used;
}

/** base64url(JSON) — how the editor passes an unsaved config to the preview route. */
export function encodeConfig(config: WallConfig): string {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(encoded: string): WallConfig | null {
  if (encoded.length > 4000) return null;
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseConfig(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
