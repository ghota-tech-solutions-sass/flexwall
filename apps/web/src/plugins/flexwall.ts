import { ConnectorError, defineConnector, definePlugin, number } from "@flexwall/sdk";

const metrics = [
  { id: "accounts", name: "Registered accounts", label: "Registered accounts" },
  { id: "walls", name: "Walls created, including drafts", label: "Walls created" },
  { id: "published", name: "Published walls", label: "Published walls" },
  { id: "connectors", name: "Available data connectors", label: "Data connectors" },
  { id: "widgets", name: "Widget types", label: "Widget types" },
];
export const flexwallConnector = defineConnector({
  id: "flexwall", name: "Flexwall", homepage: "https://flexwall.lol", description: "Live aggregate product statistics, published by Flexwall itself.", tier: "free", verified: false, ttl: 300,
  metrics: metrics.map(({ id, name, label }) => ({ id, name, type: "number" as const, unit: "count" as const, defaults: { label } })),
  cacheKey: () => "public-stats",
  async fetch(_, ctx) {
    const stats = await ctx.fetch.json<Record<string, unknown>>("https://flexwall.lol/api/public-stats");
    return Object.fromEntries(metrics.map(({ id }) => {
      const value = stats[id];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ConnectorError("Flexwall's statistics are temporarily unavailable.");
      return [id, number(value, { unit: "count" })];
    }));
  },
  sample: Object.fromEntries(metrics.map(({ id }) => [id, number(0, { unit: "count" })])),
});
export default definePlugin({ id: "flexwall", name: "Flexwall", description: "Flexwall's own live product numbers.", author: { name: "Flexwall", url: "https://flexwall.lol" }, connectors: [flexwallConnector] });
