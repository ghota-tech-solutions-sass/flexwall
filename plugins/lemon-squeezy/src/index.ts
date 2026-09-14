import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Lemon Squeezy through an API key. Lemon Squeezy has no read-only keys, so
 * the key can do more than this connector ever asks: the help text says so.
 *
 * Lemon Squeezy has no MRR endpoint, so MRR is computed, deliberately simply:
 *  - active subscriptions only (no trials, past due, unpaid, paused, cancelled or expired)
 *  - the first subscription item only, priced with the price it points to
 *  - standard and package prices; usage-based, graduated and volume prices are skipped
 *  - discounts are ignored: the subscription object doesn't carry them
 *  - prices are read as cents of the store's currency
 * Active subscriptions is Lemon Squeezy's own count of active subscriptions.
 * Revenue over 30 days is the store's own `thirty_day_revenue`, which Lemon
 * Squeezy reports in US dollars whatever the store's currency.
 */

const API = "https://api.lemonsqueezy.com/v1";
/** Pages of 100 subscriptions walked per refresh at most; past it MRR is a floor. */
export const MAX_PAGES = 50;
/** Distinct prices looked up per refresh at most (Lemon Squeezy allows 300 calls a minute). */
export const MAX_PRICES = 100;
const PER_MONTH: Record<string, number> = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };

// The slices of Lemon Squeezy objects this connector reads.
export interface Store {
  id: string;
  attributes: { name: string; slug: string; currency: string; thirty_day_revenue: number };
}
export interface Subscription {
  id: string;
  attributes: {
    status: string;
    pause: unknown | null;
    first_subscription_item: { price_id: number; quantity: number } | null;
  };
}
export interface Price {
  id: string;
  attributes: {
    scheme: string;
    usage_aggregation: string | null;
    unit_price: number | null;
    package_size: number | null;
    renewal_interval_unit: string | null;
    renewal_interval_quantity: number | null;
  };
}
interface Page<T> {
  data: T[];
  meta: { page: { currentPage: number; lastPage: number; total: number } };
}

/** Monthly value of one subscription in cents, or 0 when it doesn't count. */
export function monthlyValue(sub: Subscription, price: Price | undefined): number {
  const { status, pause, first_subscription_item: item } = sub.attributes;
  if (status !== "active" || pause || !item || !price) return 0;
  const p = price.attributes;
  if (p.usage_aggregation !== null || p.unit_price === null) return 0;
  const interval = p.renewal_interval_unit ? PER_MONTH[p.renewal_interval_unit] : undefined;
  if (interval === undefined) return 0;
  let amount: number;
  if (p.scheme === "standard") amount = p.unit_price * item.quantity;
  else if (p.scheme === "package") amount = p.unit_price * Math.ceil(item.quantity / Math.max(1, p.package_size ?? 1));
  else return 0;
  return (amount * interval) / Math.max(1, p.renewal_interval_quantity ?? 1);
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" });

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) {
    throw new ConnectorError("Lemon Squeezy refused the key. It may have been deleted, or expired: keys last a year.");
  }
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("Lemon Squeezy refused access to this store. Create the key from an account that owns the store.");
  }
  throw error;
}

async function readStore(key: string, storeId: string, ctx: ConnectorContext): Promise<Store> {
  try {
    const body = await ctx.fetch.json<{ data: Store }>(`${API}/stores/${encodeURIComponent(storeId)}`, { headers: headers(key) });
    return body.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new ConnectorError("Lemon Squeezy has no store for this connection anymore. Connect it again.");
    throw error;
  }
}

async function listStores(key: string, ctx: ConnectorContext): Promise<Store[]> {
  const body = await ctx.fetch.json<Page<Store>>(`${API}/stores?page[size]=100`, { headers: headers(key) });
  return body.data;
}

/** Active subscriptions, `pages` pages at most. The first page alone gives the exact count. */
async function readSubscriptions(key: string, storeId: string, ctx: ConnectorContext, pages: number) {
  const subscriptions: Subscription[] = [];
  let total = 0;
  for (let page = 1; page <= pages; page++) {
    const body = await ctx.fetch.json<Page<Subscription>>(
      `${API}/subscriptions?filter[store_id]=${encodeURIComponent(storeId)}&filter[status]=active&page[number]=${page}&page[size]=100`,
      { headers: headers(key), maxBytes: 4_000_000, timeoutMs: 15_000 }
    );
    subscriptions.push(...body.data);
    total = body.meta.page.total;
    if (body.data.length === 0 || body.meta.page.currentPage >= body.meta.page.lastPage) return { subscriptions, total };
  }
  if (pages === MAX_PAGES) ctx.log(`more than ${MAX_PAGES} pages of subscriptions: MRR is a floor`);
  return { subscriptions, total };
}

async function readPrices(key: string, ids: string[], ctx: ConnectorContext): Promise<Map<string, Price>> {
  const prices = new Map<string, Price>();
  if (ids.length > MAX_PRICES) ctx.log(`more than ${MAX_PRICES} prices: MRR leaves the rest out`);
  for (const id of ids.slice(0, MAX_PRICES)) {
    const body = await ctx.fetch.json<{ data: Price }>(`${API}/prices/${encodeURIComponent(id)}`, { headers: headers(key) });
    prices.set(id, body.data);
  }
  return prices;
}

async function readAccount(key: string, storeId: string, ctx: ConnectorContext, wanted: Set<string>): Promise<FetchResult> {
  const store = await readStore(key, storeId, ctx);
  const currency = store.attributes.currency.toLowerCase();
  const out: FetchResult = {};

  if (wanted.has("mrr") || wanted.has("active-subscriptions")) {
    const { subscriptions, total } = await readSubscriptions(key, store.id, ctx, wanted.has("mrr") ? MAX_PAGES : 1);
    const priceIds = [...new Set(subscriptions.flatMap((s) => (s.attributes.first_subscription_item ? [String(s.attributes.first_subscription_item.price_id)] : [])))];
    const prices = wanted.has("mrr") ? await readPrices(key, priceIds, ctx) : new Map<string, Price>();
    const cents = subscriptions.reduce((sum, s) => sum + monthlyValue(s, prices.get(String(s.attributes.first_subscription_item?.price_id))), 0);
    if (wanted.has("mrr")) out.mrr = money(Math.round(cents / 100), currency);
    out["active-subscriptions"] = number(total, { unit: "count" });
  }
  if (wanted.has("revenue-30d")) out["revenue-30d"] = money(Math.round(store.attributes.thirty_day_revenue / 100), "usd");
  return out;
}

const lemonSqueezyConnector = defineConnector({
  id: "lemon-squeezy",
  name: "Lemon Squeezy",
  description: "Verified MRR, active subscriptions and revenue from your Lemon Squeezy store.",
  homepage: "https://www.lemonsqueezy.com",
  tier: "pro",
  verified: true,
  ttl: 1800,
  auth: {
    label: "Connect Lemon Squeezy",
    help: "In Lemon Squeezy, open Settings → API and create a key only for Flexwall. Lemon Squeezy has no read-only keys: Flexwall only reads, but the key itself could change your store, so use a dedicated key you can revoke at any time. Keys expire after a year. If the account has several stores, type the one to show.",
    fields: [
      field.secret("key", "API key", { placeholder: "eyJ0eXAiOiJKV1Qi…", maxLength: 4000, pattern: "^eyJ[A-Za-z0-9_.-]+$", patternMessage: "must be a Lemon Squeezy API key, starting with eyJ" }),
      field.text("store", "Store", { placeholder: "my-store", optional: true, maxLength: 100, help: "Only needed when the account has several stores: its slug or name." }),
    ],
  },
  metrics: [
    { id: "mrr", name: "MRR", type: "number", unit: "currency", defaults: { label: "MRR" }, leaderboard: "revenue" },
    { id: "active-subscriptions", name: "Active subscriptions", type: "number", unit: "count", defaults: { label: "active subscriptions" } },
    { id: "revenue-30d", name: "Revenue, last 30 days", type: "number", unit: "currency", defaults: { label: "Revenue, 30 days" } },
  ],

  // One pass over the store answers everything.
  cacheKey: () => "account",

  async fetch({ metrics, secret, public: visible }, ctx) {
    if (!secret?.key) return {};
    try {
      // `public` is what connect() returned; it carries the chosen store so fetch doesn't list stores again.
      const storeId = visible?.storeId ?? (await listStores(secret.key, ctx))[0]?.id;
      if (!storeId) throw new ConnectorError("This Lemon Squeezy account has no store yet.");
      return await readAccount(secret.key, storeId, ctx, new Set(metrics));
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    const wanted = String(input.store ?? "").trim().toLowerCase();
    try {
      const me = await ctx.fetch.json<{ meta?: { test_mode?: boolean } }>(`${API}/users/me`, { headers: headers(key) });
      const stores = await listStores(key, ctx);
      if (stores.length === 0) throw new ConnectorError("This Lemon Squeezy account has no store yet.");
      const store = wanted
        ? stores.find((s) => [s.id, s.attributes.slug.toLowerCase(), s.attributes.name.toLowerCase()].includes(wanted))
        : stores.length === 1
          ? stores[0]
          : undefined;
      if (!store) {
        const names = stores.map((s) => s.attributes.slug).join(", ");
        throw new ConnectorError(wanted ? `No store matches that name. This key can see ${names}.` : `This key can see several stores (${names}). Type the one to show in Store.`);
      }
      const mode = me.meta?.test_mode ? "test" : "live";
      return {
        secret: { key },
        public: { hint: `…${key.slice(-4)}`, store: store.attributes.name, storeId: store.id, currency: store.attributes.currency.toLowerCase(), mode },
        label: `Lemon Squeezy: ${store.attributes.name}${mode === "test" ? " (test)" : ""}`,
        accountId: `${store.id}-${mode}`,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    mrr: money(3140, "usd"),
    "active-subscriptions": number(187, { unit: "count" }),
    "revenue-30d": money(3620, "usd"),
  },
});

export default definePlugin({
  id: "lemon-squeezy",
  name: "Lemon Squeezy",
  description: "Verified MRR, subscriptions and revenue.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [lemonSqueezyConnector],
});

export { lemonSqueezyConnector };
