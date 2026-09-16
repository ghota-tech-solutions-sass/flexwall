import { ConnectorError, defineConnector, definePlugin, ExpiredCredentialsError, field, number, type Value } from "@flexwall/sdk";
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
  /** Renewals asked of the sign-in connector, and whether its provider still honours them. */
  refreshes = 0;
  refreshMode: "ok" | "revoked" = "ok";
  /** What the sign-in connector was asked to let go of upstream, and how its provider answers. */
  disconnected: Record<string, string>[] = [];
  disconnectMode: "ok" | "fail" = "ok";

  async respond(): Promise<Record<string, Value | null>> {
    this.calls++;
    if (this.mode === "fail") throw new Error("upstream down");
    if (this.mode === "owner-error") throw new ConnectorError("The key was revoked.");
    if (this.mode === "hang") await new Promise(() => undefined);
    return this.answer;
  }
}

/** When the Social connector's first access token lapses. */
export const SOCIAL_TOKEN_EXPIRY = Date.UTC(2026, 8, 14, 10, 0, 0);

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

  const brokerage = defineConnector({
    id: "brokerage",
    name: "Brokerage",
    description: "A verified account holding someone's money.",
    tier: "pro",
    verified: true,
    ttl: 1800,
    auth: { help: "Paste a key.", fields: [field.secret("key", "Key")] },
    metrics: [{ id: "equity", name: "Equity", type: "number", unit: "currency", leaderboard: "wealth", sensitive: true }],
    cacheKey: () => "account",
    async connect(input) {
      return { secret: { key: String(input.key) }, public: {}, label: "Brokerage account" };
    },
    fetch: async () => ({ equity: number(2_400_000, { unit: "currency", currency: "usd" }) }),
    sample: { equity: number(1, { unit: "currency", currency: "usd" }) },
  });

  const wallet = defineConnector({
    id: "wallet",
    name: "Wallet",
    description: "A public address anyone can paste.",
    tier: "free",
    verified: false,
    ttl: 1800,
    metrics: [{ id: "balance", name: "Balance", type: "number", unit: "currency", leaderboard: "wealth", sensitive: true, params: [field.text("address", "Address")] }],
    fetch: async () => ({ balance: number(90_000_000, { unit: "currency", currency: "usd" }) }),
    sample: { balance: number(1, { unit: "currency", currency: "usd" }) },
  });

  const social = defineConnector({
    id: "social",
    name: "Social",
    description: "Connects by signing in at the provider, with tokens that expire.",
    tier: "free",
    verified: true,
    ttl: 600,
    ttlFor: (pub) => Number(pub.refreshHours) * 3600,
    auth: {
      help: "Sign in to allow reading your followers.",
      fields: [],
      async disconnect({ secret }) {
        if (upstream.disconnectMode === "fail") throw new Error("provider down");
        upstream.disconnected.push(secret);
      },
      oauth: {
        async authorize({ redirectUri, state }) {
          return { url: `https://social.test/authorize?${new URLSearchParams({ state, redirect_uri: redirectUri })}`, carry: { verifier: "v1" } };
        },
        async complete({ query, carry }) {
          if (query.error) throw new ConnectorError("You declined to connect Social.");
          if (query.code !== "good" || carry.verifier !== "v1") throw new ConnectorError("Social refused the sign-in.");
          return { secret: { access: "a1", refresh: "r1" }, public: { handle: "ada", refreshHours: "6" }, label: "@ada", accountId: "s1", expiresAt: SOCIAL_TOKEN_EXPIRY };
        },
        async refresh({ secret }) {
          upstream.refreshes++;
          if (upstream.refreshMode === "revoked") throw new ConnectorError("Reconnect Social: access was revoked.");
          return { secret: { access: `a${upstream.refreshes + 1}`, refresh: `${secret.refresh}+` }, expiresAt: SOCIAL_TOKEN_EXPIRY + upstream.refreshes * 3600_000 };
        },
      },
    },
    metrics: [{ id: "followers", name: "Followers", type: "number", unit: "count", leaderboard: "audience" }],
    cacheKey: () => "profile",
    fetch: async ({ secret }) => {
      if (secret?.access === "expired") throw new ExpiredCredentialsError();
      await upstream.respond();
      return { followers: number(1613, { unit: "count" }) };
    },
    sample: { followers: number(1, { unit: "count" }) },
  });

  const bank = defineConnector({
    id: "bank",
    name: "Bank",
    description: "A provider link Flexwall pays for every month, so the owner pays by the account.",
    tier: "pro",
    verified: true,
    ttl: 600,
    serverCost: "per-account",
    auth: { help: "Type a handle.", fields: [field.text("handle", "Handle")] },
    metrics: [
      { id: "followers", name: "Followers", type: "number", unit: "count" },
      { id: "posts", name: "Posts", type: "number", unit: "count" },
    ],
    async connect(input) {
      // Like the real ones: the provider names the account, so reconnecting replaces it instead of adding one.
      return { secret: {}, public: { handle: String(input.handle) }, label: `@${String(input.handle)}`, accountId: String(input.handle) };
    },
    fetch: async ({ metrics }) => {
      const out = await upstream.respond();
      return Object.fromEntries(metrics.map((m) => [m, out[m] ?? number(m === "followers" ? 900 : 40, { unit: "count" })]));
    },
    sample: { followers: number(1, { unit: "count" }), posts: number(1, { unit: "count" }) },
  });

  // Reads with a key the server holds, and says so: the host keeps sandbox keys to administrators.
  const sandboxed = defineConnector({
    id: "sandboxed",
    name: "Sandboxed",
    description: "A connector whose server keys point at its provider's test environment.",
    tier: "pro",
    verified: true,
    ttl: 600,
    auth: { help: "Sign in.", fields: [field.text("account", "Account")] },
    metrics: [{ id: "balance", name: "Balance", type: "number", unit: "currency" }],
    server: () => ({ configured: true, environment: "sandbox", detail: "sandbox.example.test" }),
    async connect(input) {
      return { secret: {}, public: { account: String(input.account) }, label: `Sandbox ${String(input.account)}` };
    },
    fetch: async () => ({ balance: number(10, { unit: "currency", currency: "usd" }) }),
    sample: { balance: number(1, { unit: "currency", currency: "usd" }) },
  });

  const plugin = definePlugin({ id: "test", name: "Test", description: "Test connectors", author: { name: "tests" }, connectors: [analytics, billing, brokerage, wallet, social, bank, sandboxed] });
  return { catalog: createCatalog([core, plugin], "night"), upstream };
}
