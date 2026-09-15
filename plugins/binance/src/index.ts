import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Binance, read with a reading-only HMAC API key.
 *
 * Signed requests carry `timestamp` and `recvWindow` in the query string and
 * an HMAC-SHA256 hex `signature` of that query string (see
 * `binanceSignature`), with the key in `X-MBX-APIKEY`.
 *
 *  - `portfolio-value`: `GET /sapi/v1/asset/wallet/balance` lists every wallet
 *    (Spot, Funding, Margin, Futures, Earn, Options, Trading Bots, Copy
 *    Trading) with its balance valued in BTC, Binance's documented default.
 *    The sum is turned into dollars with the public BTCUSDT price, one USDT
 *    counted as one dollar.
 *  - `assets`: the same call with `needBalanceDetail=true` lists each wallet's
 *    assets; distinct assets with a positive amount are counted.
 *
 * Binance refuses requests from some countries (HTTP 451) and blocks some
 * traffic at its firewall (403). Neither is the owner's to fix: those errors
 * are logged and passed through.
 *
 * Signing uses WebCrypto only: plugins are also bundled for the browser.
 */

const API = "https://api.binance.com";
/** Binance recommends 5 seconds or less. */
const RECV_WINDOW = "5000";

/** Every key permission that goes beyond reading, with the name Binance's key settings use. */
export const DANGEROUS_PERMISSIONS: Record<string, string> = {
  enableSpotAndMarginTrading: "Enable Spot & Margin Trading",
  enableMargin: "Enable Margin Loan, Repay & Transfer",
  enableFutures: "Enable Futures",
  enableVanillaOptions: "Enable European Options",
  enablePortfolioMarginTrading: "Enable Portfolio Margin Trading",
  enableFixApiTrade: "FIX API trading",
  enableWithdrawals: "Enable Withdrawals",
  enableInternalTransfer: "Enable Internal Transfer",
  permitsUniversalTransfer: "Permits Universal Transfer",
};

export type ApiRestrictions = Record<string, boolean | number> & { enableReading?: boolean };

export interface WalletBalance {
  activate: boolean;
  balance: string;
  walletName: string;
  assetBalances?: { asset: string; free?: string; locked?: string; freeze?: string; withdrawing?: string }[];
}

const encoder = new TextEncoder();

/** HMAC-SHA256 of the query string, keyed with the secret key as text, in lowercase hex. */
export async function binanceSignature(query: string, secret: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(query)));
  return [...signature].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The query string to sign: the call's parameters, then `recvWindow` and `timestamp` in milliseconds. */
export function signedQuery(params: Record<string, string>, timestamp: number): string {
  return new URLSearchParams({ ...params, recvWindow: RECV_WINDOW, timestamp: String(Math.floor(timestamp)) }).toString();
}

/** Sum of every wallet's balance, in BTC. */
export function totalInBtc(wallets: readonly WalletBalance[]): number {
  return wallets.reduce((sum, w) => sum + (Number.parseFloat(w.balance) || 0), 0);
}

/** Distinct assets with a positive amount in any wallet, or null when Binance sent no detail. */
export function countAssets(wallets: readonly WalletBalance[]): number | null {
  if (!wallets.some((w) => Array.isArray(w.assetBalances))) return null;
  const held = new Set<string>();
  for (const w of wallets) {
    for (const a of w.assetBalances ?? []) {
      const amount = [a.free, a.locked, a.freeze, a.withdrawing].reduce((sum, v) => sum + (Number.parseFloat(v ?? "0") || 0), 0);
      if (amount > 0) held.add(a.asset.toUpperCase());
    }
  }
  return held.size;
}

function errorCode(body: string): number | undefined {
  try {
    const code = (JSON.parse(body) as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

function explain(error: unknown, ctx: ConnectorContext): never {
  if (error instanceof HttpError) {
    // 451: Binance doesn't serve the country this server runs in. 403: its firewall blocked the request.
    if (error.status === 451 || error.status === 403) {
      ctx.log(`binance answered ${error.status}: this server's location or traffic is refused, not the key`);
      throw error;
    }
    const code = errorCode(error.body);
    if (code === -1022) throw new ConnectorError("Binance refused the signature, so the secret key doesn't belong to this API key.");
    if (code === -2014 || code === -2015 || code === -1002 || error.status === 401) {
      throw new ConnectorError("Binance refused this API key. It may have been deleted, or its IP restriction doesn't allow Flexwall's server.");
    }
  }
  // Rate limits (429, 418), a server clock outside recvWindow (-1021) and outages pass through.
  throw error;
}

interface Credentials {
  key: string;
  secret: string;
}

export function makeBinanceConnector(now: () => number = Date.now): ConnectorDef {
  async function signed<T>(ctx: ConnectorContext, creds: Credentials, path: string, params: Record<string, string> = {}, maxBytes?: number): Promise<T> {
    const query = signedQuery(params, now());
    const signature = await binanceSignature(query, creds.secret);
    return ctx.fetch.json<T>(`${API}${path}?${query}&signature=${signature}`, { headers: { "X-MBX-APIKEY": creds.key }, ...(maxBytes ? { maxBytes } : {}) });
  }

  async function readAccount(ctx: ConnectorContext, creds: Credentials, wanted: Set<string>): Promise<FetchResult> {
    const out: FetchResult = {};
    // Weight 60 whatever the options; the detail only makes the answer longer.
    const wallets = await signed<WalletBalance[]>(ctx, creds, "/sapi/v1/asset/wallet/balance", wanted.has("assets") ? { needBalanceDetail: "true" } : {}, 4_000_000);
    if (wanted.has("portfolio-value")) {
      const ticker = await ctx.fetch.json<{ symbol: string; price: string }>(`${API}/api/v3/ticker/price?symbol=BTCUSDT`);
      const price = Number.parseFloat(ticker.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error("Binance answered the BTCUSDT price without a price");
      out["portfolio-value"] = money(Math.round(totalInBtc(wallets) * price), "usd");
    }
    if (wanted.has("assets")) {
      const count = countAssets(wallets);
      out.assets = count === null ? null : number(count, { unit: "count" });
    }
    return out;
  }

  return defineConnector({
    id: "binance",
    name: "Binance",
    description: "Verified portfolio value and assets held across your Binance wallets, read with a reading-only API key.",
    homepage: "https://www.binance.com",
    tier: "pro",
    verified: true,
    // The wallet call weighs 60 of the 12,000 a minute its endpoint allows each IP, and every connection shares the server's IP.
    ttl: 1800,
    auth: {
      label: "Connect Binance",
      help: "In Binance, open Account → API Management → Create API → System generated (HMAC). Leave Enable Reading on and every other permission off: keys that can trade, withdraw or transfer are refused. Paste the API key and the secret key. Ed25519 and RSA keys aren't supported.",
      fields: [
        field.secret("key", "API key", { maxLength: 128, pattern: "^[A-Za-z0-9]{32,128}$", patternMessage: "must be the API key exactly as Binance shows it" }),
        field.secret("secret", "Secret key", { maxLength: 128, pattern: "^[A-Za-z0-9]{32,128}$", patternMessage: "must be the secret key of a system-generated (HMAC) key" }),
      ],
    },
    metrics: [
      {
        id: "portfolio-value",
        name: "Portfolio value",
        description: "Every Binance wallet, valued in BTC by Binance and converted to US dollars at the BTCUSDT price.",
        type: "number",
        unit: "currency",
        defaults: { label: "on Binance" },
        leaderboard: "wealth",
        sensitive: true,
      },
      { id: "assets", name: "Assets held", description: "Distinct assets with a positive balance in any wallet.", type: "number", unit: "count", defaults: { label: "assets on Binance" } },
    ],

    // One wallet call answers both.
    cacheKey: () => "account",

    async fetch({ metrics, secret }, ctx) {
      if (!secret?.key || !secret.secret) return {};
      try {
        return await readAccount(ctx, { key: secret.key, secret: secret.secret }, new Set(metrics));
      } catch (error) {
        explain(error, ctx);
      }
    },

    async connect(input, ctx) {
      const creds = { key: String(input.key ?? "").trim(), secret: String(input.secret ?? "").trim() };
      try {
        // Weight 1, and it says exactly what the key may do.
        const restrictions = await signed<ApiRestrictions>(ctx, creds, "/sapi/v1/account/apiRestrictions");
        const dangerous = Object.keys(DANGEROUS_PERMISSIONS).filter((k) => restrictions[k] === true);
        if (dangerous.length > 0) {
          throw new ConnectorError(`This key can do more than read: turn off ${dangerous.map((k) => DANGEROUS_PERMISSIONS[k]).join(", ")} in Binance, or create a key with Enable Reading only.`);
        }
        if (restrictions.enableReading !== true) throw new ConnectorError("The key can't read the account. Turn on Enable Reading in Binance.");
        // The spot account carries the user id, so reconnecting the same account replaces the connection.
        const account = await signed<{ uid?: number }>(ctx, creds, "/api/v3/account", { omitZeroBalances: "true" });
        return {
          secret: creds,
          public: { hint: `…${creds.key.slice(-4)}` },
          label: "Binance",
          ...(account.uid !== undefined ? { accountId: String(account.uid) } : {}),
        };
      } catch (error) {
        explain(error, ctx);
      }
    },

    sample: {
      "portfolio-value": money(1_250_000, "usd"),
      assets: number(23, { unit: "count" }),
    },
  });
}

const binanceConnector = makeBinanceConnector();

export default definePlugin({
  id: "binance",
  name: "Binance",
  description: "Verified portfolio value and assets held on Binance.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [binanceConnector],
});

export { binanceConnector };
