import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, series, type ConnectorContext, type FetchResult, type SeriesPoint } from "@flexwall/sdk";

/**
 * Alpaca's Trading API, live accounts only. Paper accounts hold simulated
 * money and the wealth leaderboard can't tell connections apart, so paper
 * trading isn't offered: paper keys are refused by the live host anyway.
 *
 * Alpaca keys aren't scoped: any key pair can place orders. What a key can't
 * do is move money out (deposits and withdrawals need the dashboard), so the
 * help text asks for a dedicated pair the owner can revoke.
 */

const API = "https://api.alpaca.markets";

// The slices of Alpaca objects this connector reads. Alpaca sends account amounts as strings.
export interface Account {
  id: string;
  account_number: string;
  currency: string;
  status: string;
  equity: string;
  last_equity: string;
  cash: string;
}
export interface PortfolioHistory {
  timestamp: number[];
  equity: (number | null)[];
  timeframe: string;
}

/** A decimal string or number from Alpaca, or null when it isn't one. `Number("")` would be 0, so empty is null too. */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Change since the previous close, in percent (1.09 means +1.09%). Null without a previous close to compare with. */
export function dayChange(account: Pick<Account, "equity" | "last_equity">): number | null {
  const equity = toNumber(account.equity);
  const last = toNumber(account.last_equity);
  if (equity === null || last === null || last <= 0) return null;
  return round2(((equity - last) / last) * 100);
}

/** One point per day, oldest first. Days Alpaca has no equity for are dropped, not zeroed. */
export function historyPoints(history: PortfolioHistory): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  (history.timestamp ?? []).forEach((ts, i) => {
    const v = toNumber(history.equity?.[i]);
    if (v === null || typeof ts !== "number") return;
    points.push({ t: new Date(ts * 1000).toISOString().slice(0, 10), v: round2(v) });
  });
  return points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}

const headers = (keyId: string, secretKey: string) => ({ "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey });

function explain(error: unknown): never {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    throw new ConnectorError("Alpaca refused these keys. They may have been regenerated, or they belong to a paper account: use keys from your live account.");
  }
  throw error;
}

async function readAccount(keyId: string, secretKey: string, ctx: ConnectorContext): Promise<Account> {
  const account = await ctx.fetch.json<Account>(`${API}/v2/account`, { headers: headers(keyId, secretKey) });
  // The live host only answers live keys; this guards the day it doesn't.
  if (/^PA/i.test(account.account_number ?? "")) throw new ConnectorError("This is a paper trading account. Flexwall only shows live accounts.");
  return account;
}

const alpacaConnector = defineConnector({
  id: "alpaca",
  name: "Alpaca",
  description: "Verified equity, cash and daily change of a live Alpaca brokerage account.",
  homepage: "https://alpaca.markets",
  tier: "pro",
  verified: true,
  // Equity moves while markets are open; 15 minutes keeps a tile current without polling.
  ttl: 900,
  auth: {
    label: "Connect Alpaca",
    help: "In your live Alpaca dashboard (not paper), open Home → API Keys → Generate New Keys and paste the Key ID and Secret Key. Alpaca keys can't be limited to reading: any key pair can place orders, though it can't deposit or withdraw money. Generate a pair used only by Flexwall so you can revoke it on its own.",
    fields: [
      field.secret("keyId", "API Key ID", { placeholder: "AK…", maxLength: 100, pattern: "^[A-Za-z0-9]{8,100}$", patternMessage: "can only contain letters and digits" }),
      field.secret("secretKey", "Secret Key", { maxLength: 200, pattern: "^\\S{8,200}$", patternMessage: "can't contain spaces" }),
    ],
  },
  metrics: [
    { id: "equity", name: "Equity", description: "Cash plus long positions minus short positions, in the account currency.", type: "number", unit: "currency", defaults: { label: "portfolio" }, leaderboard: "wealth", sensitive: true },
    { id: "cash", name: "Cash", type: "number", unit: "currency", defaults: { label: "cash" }, sensitive: true },
    { id: "day-change", name: "Change today", description: "Equity against the previous market close.", type: "number", unit: "percent", defaults: { label: "today" } },
    { id: "equity-history", name: "Equity, last month", description: "End-of-day equity over the last month.", type: "series", unit: "currency", defaults: { label: "portfolio, 1 month" }, sensitive: true },
  ],

  // One account request answers the numbers; the history is a second request, made only when a tile needs it.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.keyId || !secret.secretKey) return {};
    try {
      const account = await readAccount(secret.keyId, secret.secretKey, ctx);
      const currency = (account.currency || "usd").toLowerCase();
      const equity = toNumber(account.equity);
      const cash = toNumber(account.cash);
      const change = dayChange(account);
      const out: FetchResult = {
        equity: equity === null ? null : money(round2(equity), currency),
        cash: cash === null ? null : money(round2(cash), currency),
        "day-change": change === null ? null : number(change, { unit: "percent" }),
      };
      if (metrics.includes("equity-history")) {
        const history = await ctx.fetch.json<PortfolioHistory>(`${API}/v2/account/portfolio/history?period=1M&timeframe=1D`, {
          headers: headers(secret.keyId, secret.secretKey),
        });
        out["equity-history"] = series(historyPoints(history), { unit: "currency", currency });
      }
      return out;
    } catch (error) {
      explain(error);
    }
  },

  async connect(input, ctx) {
    const keyId = String(input.keyId ?? "").trim();
    const secretKey = String(input.secretKey ?? "").trim();
    try {
      const account = await readAccount(keyId, secretKey, ctx);
      const currency = (account.currency || "usd").toLowerCase();
      return {
        secret: { keyId, secretKey },
        public: { hint: `…${keyId.slice(-4)}`, account: `…${String(account.account_number).slice(-4)}`, currency },
        label: `Alpaca (…${String(account.account_number).slice(-4)})`,
        accountId: account.id,
      };
    } catch (error) {
      explain(error);
    }
  },

  sample: {
    equity: money(128_450, "usd"),
    cash: money(14_210, "usd"),
    "day-change": number(1.2, { unit: "percent" }),
    "equity-history": series(
      Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10), v: Math.round(118_000 + i * 320 + 1_800 * Math.sin(i / 2)) })),
      { unit: "currency", currency: "usd" }
    ),
  },
});

export default definePlugin({
  id: "alpaca",
  name: "Alpaca",
  description: "Verified equity and cash from a live Alpaca account.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [alpacaConnector],
});

export { alpacaConnector };
