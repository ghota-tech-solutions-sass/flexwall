import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Trading 212's public API (beta), real-money Invest and Stocks ISA accounts.
 * One request, the account summary, answers every metric. Practice (demo)
 * accounts aren't offered: they hold simulated money and the wealth
 * leaderboard can't tell connections apart.
 *
 * Keys are a pair since the API moved to HTTP Basic auth (key as user, secret
 * as password); legacy single keys in the Authorization header aren't used.
 * Keys have scopes: this connector needs `account` only.
 */

const API = "https://live.trading212.com/api/v0";

// The slice of Trading 212's AccountSummary this connector reads.
export interface AccountSummary {
  id: number;
  currency: string;
  totalValue: number;
  cash: { availableToTrade: number; inPies: number; reservedForOrders: number };
  investments: { currentValue: number; realizedProfitLoss: number; totalCost: number; unrealizedProfitLoss: number };
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Unrealised result against what the current positions cost, in percent (8.5 means +8.5%). Null with nothing invested. */
export function returnPercent(summary: Pick<AccountSummary, "investments">): number | null {
  const { unrealizedProfitLoss: result, totalCost: cost } = summary.investments ?? ({} as AccountSummary["investments"]);
  if (!finite(result) || !finite(cost) || cost <= 0) return null;
  return round2((result / cost) * 100);
}

export function toValues(summary: AccountSummary): FetchResult {
  const currency = (summary.currency || "").toLowerCase();
  if (!currency) return { "portfolio-value": null, cash: null, result: null, return: null };
  const amount = (n: unknown) => (finite(n) ? money(round2(n), currency) : null);
  const pct = returnPercent(summary);
  return {
    "portfolio-value": amount(summary.totalValue),
    cash: amount(summary.cash?.availableToTrade),
    result: amount(summary.investments?.unrealizedProfitLoss),
    return: pct === null ? null : number(pct, { unit: "percent" }),
  };
}

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 403 && /scope/i.test(error.body)) {
    throw new ConnectorError("The API key is missing a permission. Generate one with the Account data permission (the account scope).");
  }
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    throw new ConnectorError(
      "Trading 212 refused this key and secret. They may have been revoked, limited to other IP addresses, or made in Practice mode: use a key from your real-money account."
    );
  }
  throw error;
}

async function readSummary(key: string, secret: string, ctx: ConnectorContext): Promise<AccountSummary> {
  return ctx.fetch.json<AccountSummary>(`${API}/equity/account/summary`, { headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` } });
}

const trading212Connector = defineConnector({
  id: "trading212",
  name: "Trading 212",
  description: "Verified portfolio value, free cash and unrealised result of a Trading 212 account.",
  homepage: "https://www.trading212.com",
  tier: "pro",
  verified: true,
  // The summary allows 1 request every 5 seconds per account, across all its keys. 15 minutes leaves the owner's own scripts room.
  ttl: 900,
  auth: {
    label: "Connect Trading 212",
    help: "In the Trading 212 app, switch to your real-money Invest or Stocks ISA account (not Practice), open Settings → API (Beta) → Generate API key. Tick only the Account data permission (the account scope), leave IP restriction off (Flexwall's servers have no fixed address), and paste the API key and the secret, which is shown only once.",
    fields: [
      // Basic auth splits user and password at the first colon, so the key can't hold one; the secret can.
      field.secret("key", "API key", { maxLength: 200, pattern: "^[^\\s:]{8,200}$", patternMessage: "can't contain spaces or colons" }),
      field.secret("secret", "API secret", { maxLength: 200, pattern: "^\\S{8,200}$", patternMessage: "can't contain spaces" }),
    ],
  },
  metrics: [
    { id: "portfolio-value", name: "Portfolio value", description: "Trading 212's total value of the account, in its currency.", type: "number", unit: "currency", defaults: { label: "portfolio" }, leaderboard: "wealth", sensitive: true },
    { id: "cash", name: "Free cash", description: "Cash available to invest.", type: "number", unit: "currency", defaults: { label: "free cash" }, sensitive: true },
    { id: "result", name: "Unrealised result", description: "Profit or loss on the positions held now.", type: "number", unit: "currency", defaults: { label: "result" }, sensitive: true },
    { id: "return", name: "Return", description: "Unrealised result against what the positions held now cost.", type: "number", unit: "percent", defaults: { label: "return" } },
  ],

  // One summary request answers everything.
  cacheKey: () => "account",

  async fetch({ secret }, ctx) {
    if (!secret?.key || !secret.secret) return {};
    try {
      return toValues(await readSummary(secret.key, secret.secret, ctx));
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    const secret = String(input.secret ?? "").trim();
    try {
      const summary = await readSummary(key, secret, ctx);
      const account = summary.id === undefined || summary.id === null ? "" : String(summary.id);
      const currency = (summary.currency || "").toLowerCase();
      return {
        secret: { key, secret },
        public: { hint: `…${key.slice(-4)}`, ...(account ? { account: `…${account.slice(-4)}` } : {}), ...(currency ? { currency } : {}) },
        label: account ? `Trading 212 (…${account.slice(-4)})` : "Trading 212",
        ...(account ? { accountId: account } : {}),
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    "portfolio-value": money(48_730, "gbp"),
    cash: money(2_140, "gbp"),
    result: money(5_380, "gbp"),
    return: number(12.9, { unit: "percent" }),
  },
});

export default definePlugin({
  id: "trading212",
  name: "Trading 212",
  description: "Verified portfolio value and result from Trading 212.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [trading212Connector],
});

export { trading212Connector };
