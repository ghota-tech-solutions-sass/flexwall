import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Polar through an Organization Access Token with the metrics:read and
 * organizations:read scopes. Polar computes MRR itself, so this connector
 * shows Polar's own numbers from the metrics endpoint instead of recomputing
 * them. Polar's definitions, which differ from the Stripe connector's:
 *  - MRR is every ongoing subscription's net amount, normalized to a month.
 *    Trials are left out; paused, past due and cancelled-but-not-yet-ended
 *    subscriptions still count until they actually end.
 *  - Other currencies are converted to US dollars by Polar, so MRR is in USD.
 *  - Active subscriptions follows the same rule: a subscription counts until it ends.
 */

const API = "https://api.polar.sh/v1";
/** Polar's Current API version on 2026-09-14. 2026-04 is removed in January 2027: move to 2026-10 before then. */
const POLAR_VERSION = "2026-04";

interface MetricsResponse {
  periods: { timestamp: string; monthly_recurring_revenue?: number | null; active_subscriptions?: number | null }[];
  totals: { monthly_recurring_revenue?: number | null; active_subscriptions?: number | null };
}
interface Organization {
  id: string;
  name: string;
  slug: string;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Polar-Version": POLAR_VERSION, Accept: "application/json" });

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) throw new ConnectorError("Polar refused the token. It may have been revoked or expired.");
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("The token is missing a scope. Create one with metrics:read and organizations:read.");
  }
  throw error;
}

/** Today's reading of a gauge: Polar's total for the range, or the last day that has one. */
function latest(body: MetricsResponse, slug: "monthly_recurring_revenue" | "active_subscriptions"): number | null {
  const total = body.totals?.[slug];
  if (typeof total === "number") return total;
  const day = [...(body.periods ?? [])].reverse().find((p) => typeof p[slug] === "number");
  return day?.[slug] ?? null;
}

async function readMetrics(token: string, ctx: ConnectorContext): Promise<FetchResult> {
  const query = `start_date=${ctx.today}&end_date=${ctx.today}&interval=day&metrics=monthly_recurring_revenue&metrics=active_subscriptions`;
  const body = await ctx.fetch.json<MetricsResponse>(`${API}/metrics/?${query}`, { headers: headers(token), timeoutMs: 15_000 });
  const cents = latest(body, "monthly_recurring_revenue");
  const active = latest(body, "active_subscriptions");
  return {
    mrr: cents === null ? null : money(Math.round(cents / 100), "usd"),
    "active-subscriptions": active === null ? null : number(active, { unit: "count" }),
  };
}

const polarConnector = defineConnector({
  id: "polar",
  name: "Polar",
  description: "Verified MRR and active subscriptions, as Polar computes them.",
  homepage: "https://polar.sh",
  tier: "pro",
  verified: true,
  ttl: 1800,
  auth: {
    label: "Connect Polar",
    help: "In Polar, open your organization's Settings → Developers → New token. Pick only the metrics:read scope (for MRR and subscriptions) and organizations:read (for the organization's name), and nothing else.",
    fields: [
      field.secret("token", "Organization access token", {
        placeholder: "polar_oat_…",
        maxLength: 200,
        pattern: "^polar_oat_[A-Za-z0-9_-]{10,}$",
        patternMessage: "must be an organization access token starting with polar_oat_",
      }),
    ],
  },
  metrics: [
    { id: "mrr", name: "MRR", type: "number", unit: "currency", defaults: { label: "MRR" }, leaderboard: "revenue" },
    { id: "active-subscriptions", name: "Active subscriptions", type: "number", unit: "count", defaults: { label: "active subscriptions" } },
  ],

  // One metrics request answers both.
  cacheKey: () => "account",

  async fetch({ secret }, ctx) {
    if (!secret?.token) return {};
    try {
      return await readMetrics(secret.token, ctx);
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const token = String(input.token ?? "").trim();
    if (!token.startsWith("polar_oat_")) throw new ConnectorError("That isn't an organization access token. Create one in your organization's settings (polar_oat_).");
    try {
      const orgs = await ctx.fetch.json<{ items: Organization[] }>(`${API}/organizations/?limit=1`, { headers: headers(token) });
      const org = orgs.items[0];
      if (!org) throw new ConnectorError("Polar found no organization for this token.");
      // Proves metrics:read was granted now, not at the first refresh.
      await readMetrics(token, ctx);
      return {
        secret: { token },
        public: { hint: `polar_oat_…${token.slice(-4)}`, organization: org.name, slug: org.slug },
        label: `Polar: ${org.name}`,
        accountId: org.id,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    mrr: money(2750, "usd"),
    "active-subscriptions": number(143, { unit: "count" }),
  },
});

export default definePlugin({
  id: "polar",
  name: "Polar",
  description: "Verified MRR and subscriptions.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [polarConnector],
});

export { polarConnector };
