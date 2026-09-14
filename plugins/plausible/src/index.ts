import { BlockedRequestError, ConnectorError, defineConnector, definePlugin, field, HttpError, number, series, type ConnectorContext, type FetchResult, type SeriesPoint } from "@flexwall/sdk";

/**
 * Plausible Analytics through the Stats API v2 (POST /api/v2/query), on
 * plausible.io or a self-hosted instance. Stats API keys are read-only but
 * reach every site of the team they were created in; there is no per-site key.
 *
 * Two queries at most per site and refresh: one for the 30-day totals
 * (visitors and pageviews together) and one for the daily series. Visitors
 * are unique, so the total can't be summed from the daily points.
 */

export const DEFAULT_INSTANCE = "https://plausible.io";

/** The slice of a v2 query response this connector reads. */
export interface QueryResponse {
  results: { metrics: (number | null)[]; dimensions: string[] }[];
  meta?: { time_labels?: string[] };
}

const site = field.text("site", "Site", {
  placeholder: "example.com",
  help: "The domain exactly as it's listed in Plausible.",
  maxLength: 253,
  pattern: "^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$",
  patternMessage: "must be a domain like example.com",
});

/** `https://stats.example.com/` → `https://stats.example.com`. */
export function normalizeInstance(raw: string | undefined): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  return value || DEFAULT_INSTANCE;
}

/** Daily visitors, oldest first, with a zero for every day Plausible lists but has no row for. */
export function dailyPoints(response: QueryResponse): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const row of response.results) {
    const day = String(row.dimensions[0] ?? "").slice(0, 10);
    if (day) byDay.set(day, row.metrics[0] ?? 0);
  }
  const labels = response.meta?.time_labels?.length ? response.meta.time_labels.map((l) => l.slice(0, 10)) : [...byDay.keys()];
  return [...new Set(labels)].sort().map((t) => ({ t, v: byDay.get(t) ?? 0 }));
}

function query(ctx: ConnectorContext, instance: string, key: string, body: object): Promise<QueryResponse> {
  return ctx.fetch.json<QueryResponse>(`${instance}/api/v2/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 10_000,
  });
}

function explain(error: unknown, instance: string, siteId?: string): never {
  if (error instanceof BlockedRequestError && instance !== DEFAULT_INSTANCE) {
    throw new ConnectorError("Flexwall can't reach your Plausible instance: it must be a public https address that answers without redirects.");
  }
  if (error instanceof HttpError) {
    // Plausible answers 401 both for a bad key and for a good key that can't read the site.
    if (error.status === 401 || error.status === 403) {
      throw new ConnectorError(siteId ? `Plausible refused the key or it can't read ${siteId}, so check the key and that the site is in the key's team.` : "Plausible refused the key.");
    }
    if (error.status === 402) throw new ConnectorError("Plausible says this account's plan doesn't include the Stats API, or the site is locked.");
    if (error.status === 404) {
      throw new ConnectorError(siteId ? `Plausible has no site called ${siteId}.` : "This address doesn't answer like a Plausible instance with the Stats API v2.");
    }
  }
  throw error;
}

const plausibleConnector = defineConnector({
  id: "plausible",
  name: "Plausible",
  description: "Visitors and pageviews from your Plausible Analytics sites.",
  homepage: "https://plausible.io",
  tier: "pro",
  verified: true,
  // 600 API requests an hour per key; a site costs at most two per refresh.
  ttl: 900,
  auth: {
    label: "Connect Plausible",
    help: "In Plausible, open Settings → API keys → New API key and pick the Stats API. The key is read-only but can read every site in the team it was created in. Leave the instance address as it is unless you self-host Plausible.",
    fields: [
      field.secret("key", "Stats API key", { maxLength: 200, pattern: "^\\S+$", patternMessage: "can't contain spaces" }),
      field.url("instance", "Instance address", { default: DEFAULT_INSTANCE, placeholder: DEFAULT_INSTANCE, help: "Only change this if you self-host Plausible." }),
    ],
  },
  metrics: [
    { id: "visitors-30d", name: "Visitors, last 30 days", type: "number", unit: "count", params: [site], defaults: { label: "visitors, 30 days" }, leaderboard: "audience" },
    { id: "pageviews-30d", name: "Pageviews, last 30 days", type: "number", unit: "count", params: [site], defaults: { label: "pageviews, 30 days" } },
    { id: "visitors-daily", name: "Daily visitors, last 30 days", type: "series", unit: "count", params: [site], defaults: { label: "Visitors, 30 days" } },
  ],

  // Every metric of a site is fetched together: one totals query, one daily query.
  cacheKey: ({ params }) => `site:${String(params.site).trim().toLowerCase()}`,

  async fetch({ metrics, params, secret, public: shown }, ctx) {
    if (!secret?.key) return {};
    const instance = normalizeInstance(shown?.instance);
    const siteId = String(params.site).trim().toLowerCase();
    const wanted = new Set(metrics);
    const out: FetchResult = {};
    try {
      if (wanted.has("visitors-30d") || wanted.has("pageviews-30d")) {
        const totals = await query(ctx, instance, secret.key, { site_id: siteId, metrics: ["visitors", "pageviews"], date_range: "30d" });
        const [visitors, pageviews] = totals.results[0]?.metrics ?? [];
        out["visitors-30d"] = typeof visitors === "number" ? number(visitors, { unit: "count" }) : null;
        out["pageviews-30d"] = typeof pageviews === "number" ? number(pageviews, { unit: "count" }) : null;
      }
      if (wanted.has("visitors-daily")) {
        const daily = await query(ctx, instance, secret.key, {
          site_id: siteId,
          metrics: ["visitors"],
          date_range: "30d",
          dimensions: ["time:day"],
          include: { time_labels: true },
        });
        out["visitors-daily"] = series(dailyPoints(daily), { unit: "count" });
      }
    } catch (error) {
      explain(error, instance, siteId);
    }
    return out;
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    const instance = normalizeInstance(typeof input.instance === "string" ? input.instance : undefined);
    // Stats API keys have no "who am I" endpoint and no site is picked yet.
    // Plausible checks the key before the site, so a query without site_id
    // answers 400 "Missing site ID" for a good key and 401 for a bad one.
    let keyAccepted = false;
    try {
      await query(ctx, instance, key, { metrics: ["visitors"], date_range: "day" });
      // A version that tolerates a missing site still proves the key.
      keyAccepted = true;
    } catch (error) {
      keyAccepted = error instanceof HttpError && error.status === 400 && /site[ _]id/i.test(error.body);
      if (!keyAccepted && !(error instanceof HttpError && error.status === 400)) explain(error, instance);
    }
    if (!keyAccepted) throw new ConnectorError("This address doesn't answer like a Plausible instance with the Stats API v2.");
    const host = new URL(instance).host;
    return {
      secret: { key },
      public: { hint: `…${key.slice(-4)}`, instance },
      label: `Plausible (${host})`,
    };
  },

  sample: {
    "visitors-30d": number(18420, { unit: "count" }),
    "pageviews-30d": number(47310, { unit: "count" }),
    "visitors-daily": series(
      Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (30 - i) * 86_400_000).toISOString().slice(0, 10), v: Math.round(560 + i * 6 + 120 * Math.sin(i / 1.2)) })),
      { unit: "count" }
    ),
  },
});

export default definePlugin({
  id: "plausible",
  name: "Plausible",
  description: "Visitors and pageviews from Plausible Analytics.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [plausibleConnector],
});

export { plausibleConnector };
