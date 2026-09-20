import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, series, type ConnectorContext, type FetchResult, type SeriesPoint } from "@flexwall/sdk";

/**
 * Stripe through a restricted key with read access to Subscriptions, Balance
 * and Coupons. Stripe has no MRR endpoint, so MRR is computed, deliberately
 * simply, and the editor says so:
 *  - active subscriptions only (no trials, no past_due, no paused collection)
 *  - licensed prices with a unit amount (metered and tiered prices are skipped)
 *  - the account's currency only: other currencies are left out, not converted
 *  - subscription-level coupons still running, percent or amount off
 * Revenue comes from balance transactions: charges and payments minus refunds.
 */

const API = "https://api.stripe.com/v1";
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const REVENUE_TYPES = new Set(["charge", "payment", "refund", "payment_refund", "payment_failure_refund"]);
/** Objects walked per refresh at most; past it the numbers are floors. */
const MAX_OBJECTS = 20_000;
const PER_MONTH: Record<string, number> = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };

// The slices of Stripe objects this connector reads.
export interface Coupon {
  duration: "forever" | "once" | "repeating";
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
}
export interface Subscription {
  id: string;
  status: string;
  currency: string;
  pause_collection: unknown | null;
  items: { data: { quantity?: number | null; price: { unit_amount: number | null; recurring: { interval: string; interval_count: number; usage_type?: string } | null } }[] };
  discounts?: (string | { end: number | null; source?: { coupon?: string | Coupon | null } | null })[];
}
export interface BalanceTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  created: number;
}
interface List<T> {
  data: T[];
  has_more: boolean;
}

export function toMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : minor / 100;
}

/** Monthly value of one subscription in minor units of `currency`, or 0 when it doesn't count. */
export function monthlyValue(sub: Subscription, currency: string, nowSec: number): number {
  if (sub.status !== "active" || sub.pause_collection || sub.currency !== currency) return 0;
  let total = 0;
  let factor = 1;
  for (const item of sub.items.data) {
    const recurring = item.price.recurring;
    if (!recurring || recurring.usage_type === "metered" || item.price.unit_amount === null) continue;
    factor = (PER_MONTH[recurring.interval] ?? 1) / recurring.interval_count;
    total += item.price.unit_amount * (item.quantity ?? 1) * factor;
  }
  for (const d of sub.discounts ?? []) {
    if (typeof d === "string") continue;
    if (d.end !== null && d.end <= nowSec) continue;
    const coupon = d.source?.coupon;
    if (!coupon || typeof coupon === "string" || coupon.duration === "once") continue;
    if (coupon.percent_off) total *= 1 - coupon.percent_off / 100;
    else if (coupon.amount_off && coupon.currency === currency) total -= coupon.amount_off * factor;
  }
  return Math.max(0, total);
}

/** Net revenue per day (minor units), oldest first, one point for every day in the window. */
export function dailyRevenue(transactions: readonly BalanceTransaction[], currency: string, days: number, nowSec: number): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const t of transactions) {
    if (t.currency !== currency || !REVENUE_TYPES.has(t.type)) continue;
    const day = new Date(t.created * 1000).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
  }
  const points: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date((nowSec - i * 86_400) * 1000).toISOString().slice(0, 10);
    points.push({ t: day, v: byDay.get(day) ?? 0 });
  }
  return points;
}

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) throw new ConnectorError("Stripe refused the key. It may have been deleted or rolled.");
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("The key is missing a permission. Give it Read access to Subscriptions, Balance and Coupons.");
  }
  throw error;
}

async function* paginate<T extends { id: string }>(ctx: ConnectorContext, key: string, path: string, query: string): AsyncGenerator<T> {
  let after = "";
  for (let seen = 0; seen < MAX_OBJECTS; ) {
    const page = await ctx.fetch.json<List<T>>(`${API}${path}?limit=100&${query}${after ? `&starting_after=${after}` : ""}`, {
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-08-26.dahlia" },
      maxBytes: 4_000_000,
      timeoutMs: 15_000,
    });
    for (const item of page.data) yield item;
    seen += page.data.length;
    if (!page.has_more || page.data.length === 0) return;
    after = page.data[page.data.length - 1].id;
  }
}

async function readAccount(key: string, ctx: ConnectorContext, wanted: Set<string>) {
  const balance = await ctx.fetch.json<{ available: { currency: string }[]; pending: { currency: string }[] }>(`${API}/balance`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const currency = balance.available[0]?.currency ?? balance.pending[0]?.currency ?? "usd";
  const nowSec = Math.floor(Date.now() / 1000);
  const out: FetchResult = {};

  if (wanted.has("mrr") || wanted.has("subscribers")) {
    let mrr = 0;
    let subscribers = 0;
    const walk = async (expand: boolean) => {
      mrr = 0;
      subscribers = 0;
      const query = `status=active${expand ? "&expand[]=data.discounts.source.coupon" : ""}`;
      for await (const sub of paginate<Subscription>(ctx, key, "/subscriptions", query)) {
        subscribers++;
        mrr += monthlyValue(sub, currency, nowSec);
      }
    };
    try {
      await walk(true);
    } catch (error) {
      // A key without Coupons read still gets an MRR, before discounts.
      if (!(error instanceof HttpError && error.status === 403)) throw error;
      ctx.log("key can't read coupons: MRR ignores discounts");
      await walk(false);
    }
    out.mrr = money(Math.round(toMajor(mrr, currency)), currency);
    out.subscribers = number(subscribers, { unit: "count" });
  }

  if (wanted.has("revenue30d") || wanted.has("revenue-daily")) {
    const transactions: BalanceTransaction[] = [];
    for await (const t of paginate<BalanceTransaction>(ctx, key, "/balance_transactions", `created[gte]=${nowSec - 30 * 86_400}`)) transactions.push(t);
    const daily = dailyRevenue(transactions, currency, 30, nowSec);
    out.revenue30d = money(Math.round(toMajor(daily.reduce((s, p) => s + p.v, 0), currency)), currency);
    out["revenue-daily"] = series(
      daily.map((p) => ({ t: p.t, v: toMajor(p.v, currency) })),
      { unit: "currency", currency }
    );
  }
  return { currency, values: out };
}

// Sample cash receipts reconcile exactly with the displayed 30-day total.
const sampleWeights = Array.from({ length: 30 }, (_, i) => Math.round(120 + i * 4 + 40 * Math.sin(i / 2)));
const sampleWeightTotal = sampleWeights.reduce((sum, value) => sum + value, 0);
let sampleRunning = 0;
let sampleAllocated = 0;
const sampleDaily = sampleWeights.map((weight, i) => {
  sampleRunning += weight;
  const cumulative = Math.round(sampleRunning / sampleWeightTotal * 531000);
  const cents = cumulative - sampleAllocated;
  sampleAllocated = cumulative;
  return { t: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10), v: cents / 100 };
});

const stripeConnector = defineConnector({
  id: "stripe",
  name: "Stripe",
  description: "Verified MRR, revenue and paying customers, read with a restricted key.",
  homepage: "https://stripe.com",
  icon: "M13.98 11.08c-2.02-.75-3.13-1.33-3.13-2.24 0-.77.64-1.21 1.77-1.21 2.07 0 4.2.8 5.66 1.52l.83-5.1C17.94 3.5 15.6 2.6 12.35 2.6 10.06 2.6 8.15 3.2 6.8 4.3 5.38 5.47 4.65 7.16 4.65 9.2c0 3.7 2.26 5.28 5.94 6.62 2.37.84 3.16 1.44 3.16 2.37 0 .9-.77 1.42-2.17 1.42-1.73 0-4.58-.85-6.45-1.94l-.84 5.16c1.6.9 4.57 1.83 7.65 1.83 2.43 0 4.46-.57 5.83-1.66 1.53-1.2 2.32-2.97 2.32-5.26 0-3.78-2.31-5.36-6.1-6.66Z",
  tier: "pro",
  verified: true,
  ttl: 1800,
  auth: {
    label: "Connect Stripe",
    help: "In Stripe, open Developers → API keys → Create restricted key. Give it Read access to Subscriptions, Balance and Coupons, and nothing else. Full secret keys (sk_) are refused.",
    fields: [
      field.secret("key", "Restricted key", {
        placeholder: "rk_live_…",
        pattern: "^rk_(live|test)_[A-Za-z0-9]{10,}$",
        patternMessage: "must be a restricted key starting with rk_live_ or rk_test_",
      }),
    ],
  },
  metrics: [
    { id: "mrr", name: "MRR", type: "number", unit: "currency", defaults: { label: "MRR" }, leaderboard: "revenue" },
    { id: "revenue30d", name: "Revenue, last 30 days", type: "number", unit: "currency", defaults: { label: "Revenue, 30 days" } },
    { id: "revenue-daily", name: "Daily revenue, last 30 days", type: "series", unit: "currency", defaults: { label: "Revenue, 30 days" } },
    { id: "subscribers", name: "Active subscriptions", type: "number", unit: "count", defaults: { label: "paying customers" } },
  ],

  // One pass over the account answers everything.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.key) return {};
    try {
      return (await readAccount(secret.key, ctx, new Set(metrics))).values;
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    if (/^sk_/.test(key)) throw new ConnectorError("That's a full secret key. Create a restricted key (rk_) with read-only access instead.");
    try {
      const { currency } = await readAccount(key, ctx, new Set(["mrr"]));
      const mode = key.startsWith("rk_live_") ? "live" : "test";
      return {
        secret: { key },
        public: { hint: `${key.slice(0, 8)}…${key.slice(-4)}`, mode, currency },
        label: `Stripe ${mode} (${currency.toUpperCase()})`,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    mrr: money(4820, "usd"),
    revenue30d: money(5310, "usd"),
    "revenue-daily": series(
      sampleDaily,
      { unit: "currency", currency: "usd" }
    ),
    subscribers: number(212, { unit: "count" }),
  },
});

export default definePlugin({
  id: "stripe",
  name: "Stripe",
  description: "Verified MRR, revenue and customers.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [stripeConnector],
});

export { stripeConnector };
