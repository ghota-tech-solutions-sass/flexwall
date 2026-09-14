import Stripe from "stripe";
import { CATALOG, checkFields } from "@/lib/connectors/catalog";
import { ConnectorError, type Connector, type Values } from "@/lib/connectors/types";

/**
 * Stripe, through a restricted key with read access to Subscriptions and
 * Balance. Stripe has no MRR endpoint, so it's computed, deliberately simple
 * and stated in the editor:
 *  - active subscriptions only (no trials, no past_due, no paused collection)
 *  - licensed prices with a unit amount (metered and tiered prices are skipped)
 *  - the account's default currency only: other currencies are left out, not converted
 *  - subscription-level coupons that are still running, percent or amount off
 * Revenue is the sum of charges minus refunds from balance transactions over
 * the last 30 days, in the account's currency.
 */

const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const REVENUE_TYPES = new Set(["charge", "payment", "refund", "payment_refund", "payment_failure_refund"]);
/** Upper bound on objects walked per refresh; beyond this the number is a floor. */
const MAX_OBJECTS = 20_000;

export function toMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : minor / 100;
}

const PER_MONTH: Record<Stripe.Price.Recurring.Interval, number> = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };

/** Monthly value of one subscription in minor units of `currency`, or 0 when it doesn't count. */
export function monthlyValue(sub: Stripe.Subscription, currency: string, nowSec: number): number {
  if (sub.status !== "active" || sub.pause_collection || sub.currency !== currency) return 0;
  let total = 0;
  let intervalFactor = 1;
  for (const item of sub.items.data) {
    const recurring = item.price.recurring;
    if (!recurring || recurring.usage_type === "metered" || item.price.unit_amount === null) continue;
    intervalFactor = PER_MONTH[recurring.interval] / recurring.interval_count;
    total += item.price.unit_amount * (item.quantity ?? 1) * intervalFactor;
  }
  for (const d of sub.discounts ?? []) {
    if (typeof d === "string") continue;
    if (d.end !== null && d.end <= nowSec) continue;
    const coupon = d.source?.coupon;
    if (!coupon || typeof coupon === "string" || coupon.duration === "once") continue;
    if (coupon.percent_off) total *= 1 - coupon.percent_off / 100;
    else if (coupon.amount_off && coupon.currency === currency) total -= coupon.amount_off * intervalFactor;
  }
  return Math.max(0, total);
}

export function revenueOf(transactions: Pick<Stripe.BalanceTransaction, "type" | "amount" | "currency">[], currency: string): number {
  return transactions.filter((t) => t.currency === currency && REVENUE_TYPES.has(t.type)).reduce((sum, t) => sum + t.amount, 0);
}

function client(key: string): Stripe {
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 15_000, appInfo: { name: "flexwall.lol" } });
}

function explain(error: unknown): never {
  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    throw new ConnectorError("Stripe refused the key. It may have been deleted or rolled.");
  }
  if (error instanceof Stripe.errors.StripePermissionError) {
    throw new ConnectorError("The key is missing a permission. Give it Read access to Subscriptions and Balance.");
  }
  throw error;
}

async function readAccount(stripe: Stripe): Promise<{ currency: string; values: Values }> {
  try {
    const balance = await stripe.balance.retrieve();
    const currency = balance.available[0]?.currency ?? balance.pending[0]?.currency ?? "usd";
    const nowSec = Math.floor(Date.now() / 1000);

    let mrrMinor = 0;
    let subscribers = 0;
    let seen = 0;
    for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.discounts.source.coupon"] })) {
      if (++seen > MAX_OBJECTS) break;
      subscribers++;
      mrrMinor += monthlyValue(sub, currency, nowSec);
    }

    const transactions: Stripe.BalanceTransaction[] = [];
    for await (const t of stripe.balanceTransactions.list({ created: { gte: nowSec - 30 * 86_400 }, limit: 100 })) {
      if (transactions.length >= MAX_OBJECTS) break;
      transactions.push(t);
    }

    return {
      currency,
      values: {
        mrr: Math.round(toMajor(mrrMinor, currency)),
        revenue30d: Math.round(toMajor(revenueOf(transactions, currency), currency)),
        subscribers,
      },
    };
  } catch (error) {
    explain(error);
  }
}

const SYMBOLS: Record<string, string> = { usd: "$", eur: "€", gbp: "£", jpy: "¥", inr: "₹", cad: "$", aud: "$", chf: "CHF " };

export const stripe: Connector = {
  spec: CATALOG.stripe,
  ttlMs: 30 * 60 * 1000,

  // One pass over the account answers every Stripe metric.
  cacheKey: () => "account",

  async fetch({ connection }) {
    if (!connection) return { mrr: null, revenue30d: null, subscribers: null };
    return (await readAccount(client(connection.secret.key))).values;
  },

  async connect(input) {
    const key = input.key?.trim() ?? "";
    if (/^sk_/.test(key)) throw new ConnectorError("That's a full secret key. Create a restricted key (rk_) with read-only access instead.");
    const problem = checkFields(CATALOG.stripe.connection.fields, { key });
    if (problem) throw new ConnectorError(problem + ".");
    const { currency, values } = await readAccount(client(key));
    const mode = key.startsWith("rk_live_") ? "live" : "test";
    return {
      secret: { key },
      public: { hint: `${key.slice(0, 8)}…${key.slice(-4)}`, mode, currency, symbol: SYMBOLS[currency] ?? currency.toUpperCase() + " " },
      label: `Stripe (${mode}, ${currency.toUpperCase()})`,
      values,
    };
  },

  sample: (field) => ({ mrr: 4820, revenue30d: 5310, subscribers: 212 })[field] ?? 0,
};
