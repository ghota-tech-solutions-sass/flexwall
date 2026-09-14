import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * RevenueCat through a V2 secret API key with one permission,
 * charts_metrics:overview:read. RevenueCat computes MRR itself, so this
 * connector shows RevenueCat's own overview numbers instead of recomputing
 * them, from a single request to the project's overview metrics:
 *  - MRR: RevenueCat's monthly recurring revenue: every paid, unexpired
 *    subscription normalized to a month, auto-renew off included.
 *  - Revenue: gross revenue of the last 28 days, before store fees and taxes.
 *  - Money comes in the response's `currency` (USD unless the project says
 *    otherwise), converted by RevenueCat. The per-metric `unit` is "$" whatever
 *    the currency, so it's ignored.
 * A metric RevenueCat doesn't return gives no value rather than a zero.
 */

const API = "https://api.revenuecat.com/v2";

export interface OverviewMetric {
  object: "overview_metric";
  id: string;
  name: string;
  description: string;
  unit: string;
  period: string;
  value: number;
  last_updated_at: number | null;
  last_updated_at_iso8601: string | null;
}
export interface OverviewMetrics {
  object: "overview_metrics";
  metrics: OverviewMetric[];
  currency?: string;
}

/** Flexwall metric → RevenueCat overview metric id. */
const IDS = {
  mrr: "mrr",
  revenue28d: "revenue",
  "active-subscriptions": "active_subscriptions",
  "active-trials": "active_trials",
  "new-customers-28d": "new_customers",
  "active-users-28d": "active_users",
} as const;

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) {
    throw new ConnectorError("RevenueCat refused the key. Use a V2 secret key: V1 keys don't work with this API.");
  }
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("RevenueCat refused access. Check that the key belongs to this project and has Charts & metrics read access.");
  }
  if (error instanceof HttpError && error.status === 404) throw new ConnectorError("RevenueCat has no project with this id.");
  throw error;
}

/** Values in the overview's currency, major units; `null` for a metric RevenueCat didn't send. */
export function toValues(body: OverviewMetrics): { currency: string; values: FetchResult } {
  const currency = (body.currency ?? "USD").toLowerCase();
  const find = (id: string) => {
    const m = body.metrics?.find((x) => x.id === id);
    return m && typeof m.value === "number" && Number.isFinite(m.value) ? m.value : null;
  };
  const amount = (id: string) => {
    const v = find(id);
    return v === null ? null : money(Math.round(v), currency);
  };
  const count = (id: string) => {
    const v = find(id);
    return v === null ? null : number(v, { unit: "count" });
  };
  return {
    currency,
    values: {
      mrr: amount(IDS.mrr),
      revenue28d: amount(IDS.revenue28d),
      "active-subscriptions": count(IDS["active-subscriptions"]),
      "active-trials": count(IDS["active-trials"]),
      "new-customers-28d": count(IDS["new-customers-28d"]),
      "active-users-28d": count(IDS["active-users-28d"]),
    },
  };
}

async function readOverview(key: string, project: string, ctx: ConnectorContext) {
  const body = await ctx.fetch.json<OverviewMetrics>(`${API}/projects/${encodeURIComponent(project)}/metrics/overview`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    timeoutMs: 15_000,
  });
  if (!body || !Array.isArray(body.metrics)) throw new Error("RevenueCat answered without overview metrics");
  return toValues(body);
}

const revenuecatConnector = defineConnector({
  id: "revenuecat",
  name: "RevenueCat",
  description: "Verified MRR, revenue, subscriptions and trials of your apps, as RevenueCat computes them.",
  homepage: "https://www.revenuecat.com",
  tier: "pro",
  verified: true,
  // The Charts & Metrics API allows 25 requests a minute per project; one request answers every metric.
  ttl: 1800,
  auth: {
    label: "Connect RevenueCat",
    help: "In RevenueCat, open Project settings → API keys → + New secret API key. Choose version V2 and set Charts & metrics to Read only (charts_metrics:overview:read), with every other permission set to No access. Public SDK keys and V1 keys don't work. The project id is in the dashboard URL and in Project settings.",
    fields: [
      field.secret("key", "V2 secret API key", {
        placeholder: "sk_…",
        maxLength: 200,
        pattern: "^sk_[A-Za-z0-9_-]{10,}$",
        patternMessage: "must be a secret API key starting with sk_",
      }),
      field.text("project", "Project id", {
        placeholder: "proj1ab2c3d4",
        maxLength: 255,
        pattern: "^[A-Za-z0-9_-]+$",
        patternMessage: "can only use letters, digits, dashes and underscores",
      }),
    ],
  },
  metrics: [
    { id: "mrr", name: "MRR", type: "number", unit: "currency", defaults: { label: "MRR" }, leaderboard: "revenue" },
    { id: "revenue28d", name: "Revenue, last 28 days", description: "Gross, before store fees and taxes.", type: "number", unit: "currency", defaults: { label: "Revenue, 28 days" } },
    { id: "active-subscriptions", name: "Active subscriptions", type: "number", unit: "count", defaults: { label: "active subscriptions" } },
    { id: "active-trials", name: "Active trials", type: "number", unit: "count", defaults: { label: "active trials" } },
    { id: "new-customers-28d", name: "New customers, last 28 days", type: "number", unit: "count", defaults: { label: "new customers, 28 days" } },
    { id: "active-users-28d", name: "Active users, last 28 days", type: "number", unit: "count", defaults: { label: "active users, 28 days" } },
  ],

  // One overview request answers everything.
  cacheKey: () => "account",

  async fetch({ secret, public: visible }, ctx) {
    if (!secret?.key || !visible?.project) return {};
    try {
      return (await readOverview(secret.key, visible.project, ctx)).values;
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    const project = String(input.project ?? "").trim();
    if (!key.startsWith("sk_")) throw new ConnectorError("That isn't a secret API key. Create a V2 secret key (sk_) in Project settings → API keys.");
    try {
      // The overview itself is the cheapest call that proves the key, its permission and the project id at once.
      const { currency } = await readOverview(key, project, ctx);
      return {
        secret: { key },
        public: { hint: `sk_…${key.slice(-4)}`, project, currency },
        label: `RevenueCat (${project})`,
        accountId: project,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    mrr: money(6240, "usd"),
    revenue28d: money(7115, "usd"),
    "active-subscriptions": number(1318, { unit: "count" }),
    "active-trials": number(96, { unit: "count" }),
    "new-customers-28d": number(2410, { unit: "count" }),
    "active-users-28d": number(18_730, { unit: "count" }),
  },
});

export default definePlugin({
  id: "revenuecat",
  name: "RevenueCat",
  description: "Verified in-app subscription MRR, revenue and subscribers.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [revenuecatConnector],
});

export { revenuecatConnector };
