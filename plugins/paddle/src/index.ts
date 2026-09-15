import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, series, type ConnectorContext, type FetchResult, type SeriesPoint } from "@flexwall/sdk";

/**
 * Paddle Billing through an API key with only the metrics.read permission.
 * Paddle computes MRR, subscribers and revenue itself (Metrics API, released
 * March 2026), so this connector shows Paddle's own daily numbers instead of
 * walking subscriptions and recomputing them. Paddle's definitions:
 *  - MRR: recurring revenue of active subscriptions, normalized to a month,
 *    without one-time payments and before Paddle fees.
 *  - Subscribers: paying users with active subscriptions, trials left out.
 *  - Revenue: completed payments net of tax and Paddle fees, before refunds
 *    and chargebacks.
 *  - Every amount is in the account's primary balance currency: Paddle
 *    converts other currencies, so there is no currency to choose.
 * Paddle Classic isn't supported: its API is a different product.
 */

const HOSTS = { live: "https://api.paddle.com", sdbx: "https://sandbox-api.paddle.com" } as const;
/** Paddle's documented key format; client-side tokens and legacy unscoped keys don't match. */
const KEY_PATTERN = "^pdl_(live|sdbx)_apikey_[a-z\\d]{26}_[a-zA-Z\\d]{22}_[a-zA-Z\\d]{3}$";
/** Paddle's zero-decimal currencies: amounts are already whole units. */
const ZERO_DECIMAL = new Set(["clp", "jpy", "krw"]);
/** Days of history asked for: the 30-day revenue, and the latest day for gauges. */
const DAYS = 30;

export interface TimeseriesPoint {
  timestamp: string;
  amount?: string;
  count?: number;
}
export interface Timeseries {
  data: { timeseries: TimeseriesPoint[]; starts_at: string; ends_at: string; interval: string; currency_code?: string; updated_at: string | null };
}

export function toMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : minor / 100;
}

function environment(key: string): keyof typeof HOSTS {
  return key.startsWith("pdl_sdbx_") ? "sdbx" : "live";
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last day of a timeseries that carries the field, or null when none does. */
export function latest(body: Timeseries, fieldName: "amount" | "count"): number | null {
  const points = body.data?.timeseries ?? [];
  for (let i = points.length - 1; i >= 0; i--) {
    const raw = points[i][fieldName];
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) throw new ConnectorError("Paddle refused the API key. It may have been revoked or expired.");
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("The API key is missing a permission. Give it metrics.read (Metrics: read).");
  }
  throw error;
}

async function metric(key: string, path: string, ctx: ConnectorContext): Promise<Timeseries> {
  // `from` is inclusive and `to` exclusive, both at 00:00 UTC: the last DAYS days, today included.
  const to = addDays(ctx.today, 1);
  const from = addDays(to, -DAYS);
  return ctx.fetch.json<Timeseries>(`${HOSTS[environment(key)]}/metrics/${path}?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    timeoutMs: 15_000,
  });
}

async function readMetrics(key: string, ctx: ConnectorContext, wanted: Set<string>): Promise<{ currency: string | null; values: FetchResult }> {
  const out: FetchResult = {};
  let currency: string | null = null;

  if (wanted.has("mrr")) {
    const body = await metric(key, "monthly-recurring-revenue", ctx);
    currency = body.data?.currency_code?.toLowerCase() ?? null;
    const minor = latest(body, "amount");
    out.mrr = minor === null || !currency ? null : money(Math.round(toMajor(minor, currency)), currency);
  }
  if (wanted.has("subscribers")) {
    const count = latest(await metric(key, "active-subscribers", ctx), "count");
    out.subscribers = count === null ? null : number(count, { unit: "count" });
  }
  if (wanted.has("revenue30d") || wanted.has("revenue-daily")) {
    const body = await metric(key, "revenue", ctx);
    const cur = body.data?.currency_code?.toLowerCase();
    currency ??= cur ?? null;
    const points: SeriesPoint[] = (body.data?.timeseries ?? []).flatMap((p) => {
      const minor = Number(p.amount);
      return Number.isFinite(minor) && cur ? [{ t: p.timestamp.slice(0, 10), v: toMajor(minor, cur) }] : [];
    });
    out.revenue30d = cur ? money(Math.round(points.reduce((s, p) => s + p.v, 0)), cur) : null;
    out["revenue-daily"] = cur ? series(points, { unit: "currency", currency: cur }) : series([]);
  }
  return { currency, values: out };
}

const paddleConnector = defineConnector({
  id: "paddle",
  name: "Paddle",
  description: "Verified MRR, subscribers and revenue from Paddle Billing, as Paddle computes them.",
  homepage: "https://www.paddle.com",
  tier: "pro",
  verified: true,
  // Paddle allows 240 requests a minute per IP; a refresh makes three at most.
  ttl: 1800,
  auth: {
    label: "Connect Paddle",
    help: "In Paddle Billing, open Developer tools → Authentication → API keys → New API key. Give it only the metrics.read permission (Metrics: read) and nothing else. Live keys (pdl_live_apikey_) read live data, sandbox keys (pdl_sdbx_apikey_) read the sandbox. Client-side tokens and keys in the old format are refused.",
    fields: [
      field.secret("key", "API key", {
        placeholder: "pdl_live_apikey_…",
        maxLength: 100,
        pattern: KEY_PATTERN,
        patternMessage: "must be a Paddle Billing API key starting with pdl_live_apikey_ or pdl_sdbx_apikey_",
      }),
    ],
  },
  metrics: [
    { id: "mrr", name: "MRR", type: "number", unit: "currency", defaults: { label: "MRR" }, leaderboard: "revenue" },
    { id: "revenue30d", name: "Revenue, last 30 days", description: "Net of tax and Paddle fees, before refunds.", type: "number", unit: "currency", defaults: { label: "Revenue, 30 days" } },
    { id: "revenue-daily", name: "Daily revenue, last 30 days", type: "series", unit: "currency", defaults: { label: "Revenue, 30 days" } },
    { id: "subscribers", name: "Active subscribers", type: "number", unit: "count", defaults: { label: "paying customers" } },
  ],

  // One group; each metric endpoint is only called when a tile needs it.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.key) return {};
    try {
      return (await readMetrics(secret.key, ctx, new Set(metrics))).values;
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    if (!new RegExp(KEY_PATTERN).test(key)) {
      throw new ConnectorError("That isn't a Paddle Billing API key. Create one in Developer tools → Authentication (pdl_live_apikey_…).");
    }
    try {
      // MRR is the cheapest call that proves the key and metrics.read, and it names the balance currency.
      const { currency } = await readMetrics(key, ctx, new Set(["mrr"]));
      const mode = environment(key) === "sdbx" ? "sandbox" : "live";
      const shown = currency ? currency.toUpperCase() : "no data yet";
      return {
        secret: { key },
        public: { hint: `…${key.slice(-4)}`, mode, ...(currency ? { currency } : {}) },
        label: `Paddle ${mode} (${shown})`,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    mrr: money(8930, "usd"),
    revenue30d: money(9480, "usd"),
    "revenue-daily": series(
      Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10), v: Math.round(250 + i * 5 + 70 * Math.sin(i / 2)) })),
      { unit: "currency", currency: "usd" }
    ),
    subscribers: number(341, { unit: "count" }),
  },
});

export default definePlugin({
  id: "paddle",
  name: "Paddle",
  description: "Verified Paddle Billing MRR, subscribers and revenue.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [paddleConnector],
});

export { paddleConnector };
