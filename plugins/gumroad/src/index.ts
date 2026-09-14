import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Gumroad through a personal access token. Gumroad has no read-only personal
 * tokens: a generated token carries every scope of its application, so the
 * help text says so, and this connector only ever sends GET requests.
 *
 * Every number comes from Gumroad's own aggregate, `GET /v2/sales/summary`
 * (view_sales scope), rather than walking `/v2/sales` ten sales a page:
 *  - revenue: sales charged in the window minus what was refunded on them,
 *    before Gumroad's fees, always in US dollars
 *  - sales: Gumroad's count of charged sales in the window, refunded ones
 *    included
 *  - windows follow the seller's Gumroad timezone; all-time starts in 2011
 * No MRR: Gumroad doesn't expose one, so nothing here enters the revenue
 * leaderboard.
 */

const API = "https://api.gumroad.com/v2";
/** Before Gumroad's first sale: `from` for all-time totals. */
const ALL_TIME_FROM = "2011-01-01";

export interface SalesSummary {
  success: boolean;
  gross_cents: number;
  net_cents: number;
  units: number;
  refunded_cents: number;
  refunded_units: number;
  currency: string;
  from: string;
  to: string;
}
interface UserResponse {
  success: boolean;
  user?: { user_id: string; name?: string | null; url?: string | null };
  message?: string;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });

/** Revenue in whole dollars and a sales count, from one summary. */
export function readSummary(summary: SalesSummary): { revenue: number; sales: number } {
  return {
    revenue: Math.round(summary.net_cents / 100),
    sales: summary.units,
  };
}

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) throw new ConnectorError("Gumroad refused the access token. It may have been revoked, or its application deleted.");
  if (error instanceof HttpError && error.status === 403) throw new ConnectorError("The access token can't read sales. Generate one from an application with the view_sales scope.");
  throw error;
}

async function summary(token: string, ctx: ConnectorContext, from?: string): Promise<SalesSummary> {
  // Without `from`, Gumroad returns the last 30 days, today included, in the seller's timezone.
  const body = await ctx.fetch.json<SalesSummary>(`${API}/sales/summary${from ? `?from=${from}` : ""}`, { headers: headers(token), timeoutMs: 15_000 });
  if (!body?.success) throw new Error("Gumroad answered the sales summary without success");
  return body;
}

async function readAccount(token: string, ctx: ConnectorContext, wanted: Set<string>): Promise<FetchResult> {
  const out: FetchResult = {};
  if (wanted.has("revenue30d") || wanted.has("sales30d")) {
    const { revenue, sales } = readSummary(await summary(token, ctx));
    out.revenue30d = money(revenue, "usd");
    out.sales30d = number(sales, { unit: "count" });
  }
  if (wanted.has("revenue-total") || wanted.has("sales")) {
    const { revenue, sales } = readSummary(await summary(token, ctx, ALL_TIME_FROM));
    out["revenue-total"] = money(revenue, "usd");
    out.sales = number(sales, { unit: "count" });
  }
  return out;
}

const gumroadConnector = defineConnector({
  id: "gumroad",
  name: "Gumroad",
  description: "Verified all-time and 30-day revenue and sales from your Gumroad account.",
  homepage: "https://gumroad.com",
  tier: "pro",
  verified: true,
  // Gumroad publishes no rate limit: an hour, as the review rules ask.
  ttl: 3600,
  auth: {
    label: "Connect Gumroad",
    help: "In Gumroad, open Settings → Advanced → Applications, create an application only for Flexwall (any icon, name Flexwall, redirect URI http://127.0.0.1), then click Generate access token. Gumroad has no read-only personal tokens: the token can do more than read sales, even though Flexwall only reads them. Delete the application to revoke it at any time.",
    fields: [
      field.secret("token", "Access token", {
        placeholder: "Generated access token",
        maxLength: 200,
        pattern: "^[A-Za-z0-9_-]{20,}$",
        patternMessage: "can only use letters, digits, dashes and underscores",
      }),
    ],
  },
  metrics: [
    { id: "revenue-total", name: "Revenue, all time", description: "Sales minus refunds, before Gumroad fees, in US dollars.", type: "number", unit: "currency", defaults: { label: "earned on Gumroad" } },
    { id: "sales", name: "Sales, all time", type: "number", unit: "count", defaults: { label: "sales" } },
    { id: "revenue30d", name: "Revenue, last 30 days", description: "Sales minus refunds, before Gumroad fees, in US dollars.", type: "number", unit: "currency", defaults: { label: "Revenue, 30 days" } },
    { id: "sales30d", name: "Sales, last 30 days", type: "number", unit: "count", defaults: { label: "sales, 30 days" } },
  ],

  // One group; the 30-day and all-time summaries are only requested when a tile needs them.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.token) return {};
    try {
      return await readAccount(secret.token, ctx, new Set(metrics));
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const token = String(input.token ?? "").trim();
    try {
      const me = await ctx.fetch.json<UserResponse>(`${API}/user`, { headers: headers(token) });
      if (!me?.success || !me.user?.user_id) throw new ConnectorError("Gumroad didn't recognise this access token.");
      // Proves view_sales now, not at the first refresh: /user works without it.
      await summary(token, ctx);
      const name = me.user.name?.trim() || me.user.url?.replace(/^https?:\/\//, "") || "account";
      return {
        secret: { token },
        public: { hint: `…${token.slice(-4)}`, name, ...(me.user.url ? { url: me.user.url } : {}) },
        label: `Gumroad: ${name}`,
        accountId: me.user.user_id,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    "revenue-total": money(48_760, "usd"),
    sales: number(2_314, { unit: "count" }),
    revenue30d: money(2_190, "usd"),
    sales30d: number(97, { unit: "count" }),
  },
});

export default definePlugin({
  id: "gumroad",
  name: "Gumroad",
  description: "Verified Gumroad revenue and sales.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [gumroadConnector],
});

export { gumroadConnector };
