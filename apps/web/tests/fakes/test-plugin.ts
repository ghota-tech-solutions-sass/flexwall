import { ConnectorError, defineConnector, definePlugin, field, number, type Value } from "@flexwall/sdk";
import core from "@flexwall/plugin-core";
import { createCatalog } from "@/plugins/catalog";

/**
 * Connectors whose behaviour a test controls: what they answer, whether they
 * fail or hang, and how many times they were called.
 */
export class ScriptedUpstream {
  calls = 0;
  answer: Record<string, Value | null> = { visitors: number(120), signups: number(8) };
  mode: "ok" | "fail" | "hang" | "owner-error" = "ok";

  async respond(): Promise<Record<string, Value | null>> {
    this.calls++;
    if (this.mode === "fail") throw new Error("upstream down");
    if (this.mode === "owner-error") throw new ConnectorError("The key was revoked.");
    if (this.mode === "hang") await new Promise(() => undefined);
    return this.answer;
  }
}

export function testCatalog(upstream = new ScriptedUpstream()) {
  const analytics = defineConnector({
    id: "analytics",
    name: "Analytics",
    description: "A free connector answering several metrics in one call.",
    tier: "free",
    verified: false,
    ttl: 600,
    metrics: [
      { id: "visitors", name: "Visitors", type: "number", params: [field.text("site", "Site")] },
      { id: "signups", name: "Signups", type: "number", params: [field.text("site", "Site")] },
    ],
    cacheKey: ({ params }) => `site:${params.site}`,
    fetch: () => upstream.respond(),
    sample: { visitors: number(1), signups: number(1) },
  });

  const billing = defineConnector({
    id: "billing",
    name: "Billing",
    description: "A pro connector that needs an account.",
    tier: "pro",
    verified: true,
    ttl: 1800,
    auth: { help: "Paste a key.", fields: [field.secret("key", "Key", { pattern: "^key_", patternMessage: "must start with key_" })] },
    metrics: [{ id: "mrr", name: "MRR", type: "number", unit: "currency", leaderboard: "revenue", defaults: { label: "Monthly revenue" } }],
    cacheKey: () => "account",
    async connect(input) {
      if (input.key === "key_revoked") throw new ConnectorError("That key was revoked.");
      return { secret: { key: String(input.key) }, public: { hint: "key_…" + String(input.key).slice(-2) }, label: "Billing account", accountId: "acct_1" };
    },
    fetch: async ({ secret }) => {
      if (!secret?.key) return {};
      const out = await upstream.respond();
      return { mrr: out.mrr ?? number(4800, { unit: "currency", currency: "usd" }) };
    },
    sample: { mrr: number(1, { unit: "currency", currency: "usd" }) },
  });

  const plugin = definePlugin({ id: "test", name: "Test", description: "Test connectors", author: { name: "tests" }, connectors: [analytics, billing] });
  return { catalog: createCatalog([core, plugin], "night"), upstream };
}
