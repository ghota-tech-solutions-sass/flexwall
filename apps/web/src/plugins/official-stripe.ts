import { ConnectorError, defineConnector, definePlugin, isValue, type FetchResult } from "@flexwall/sdk";
import { stripeConnector } from "@flexwall/plugin-stripe";
export const officialStripeConnector = defineConnector({
  id: "flexwall-stripe", name: "Stripe · Flexwall", homepage: "https://flexwall.lol/@flexwall", description: "Flexwall's public live Stripe numbers. This source always reports Flexwall, not your own business.", tier: "free", verified: false, ttl: 1800,
  metrics: stripeConnector.metrics.map((metric) => ({ ...metric, name: `Flexwall · ${metric.name}`, leaderboard: undefined })),
  cacheKey: () => "official-live",
  async fetch(_, ctx) {
    const report = await ctx.fetch.json<{ mode?: string; values?: FetchResult }>("https://flexwall.lol/api/public-stats/stripe");
    if (report.mode !== "live") throw new ConnectorError("Flexwall's live Stripe statistics are unavailable.");
    const out: FetchResult = {};
    for (const metric of stripeConnector.metrics) {
      const value = report.values?.[metric.id];
      if (!isValue(value) || value.type !== metric.type) throw new ConnectorError("Flexwall's Stripe report is incomplete.");
      out[metric.id] = value;
    }
    return out;
  },
  sample: stripeConnector.sample,
});
export default definePlugin({ id: "flexwall-stripe", name: "Stripe · Flexwall", description: "Public live financial metrics for Flexwall.", author: { name: "Flexwall", url: "https://flexwall.lol" }, connectors: [officialStripeConnector] });
