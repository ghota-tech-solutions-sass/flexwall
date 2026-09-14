import { ConnectorError, defineConnector, definePlugin, field, money, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Kraken spot, read with an API key that can only query funds.
 *
 * Private endpoints are POST, form-encoded, signed with HMAC-SHA512 (see
 * `krakenSignature`). Kraken barely uses HTTP status codes: a refused key
 * comes back as a 200 with `error: ["EAPI:Invalid key"]`, so errors are read
 * from the body.
 *
 *  - `portfolio-value`: `TradeBalance` with `asset=ZUSD`, field `eb`, which
 *    Kraken documents as the combined balance of all currencies, valued in USD.
 *  - `assets`: `Balance`, counting currencies with a positive balance, with
 *    staked and rewards variants (`ETH2.S`, `USD.M`, `DOT.F`) folded into their base.
 *
 * Signing uses WebCrypto only: plugins are also bundled for the browser.
 */

const API = "https://api.kraken.com";

/** Permissions that let a key move money or orders. Values from `GetApiKeyInfo`, names as Kraken's key form shows them. */
export const DANGEROUS_PERMISSIONS: Record<string, string> = {
  "withdraw-funds": "Withdraw Funds",
  "add-funds": "Deposit Funds",
  "earn-funds": "Earn Funds",
  "modify-trades": "Create & Modify Orders",
  "close-trades": "Cancel/Close Orders",
  "add-withdraw-address": "Add withdrawal addresses",
  "update-withdraw-address": "Update withdrawal addresses",
};

/** Kraken's legacy four-letter codes, and names that are the same currency under another code. */
const ALIASES: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XXDG: "DOGE",
  XDG: "DOGE",
  XETH: "ETH",
  ETH2: "ETH",
  XETC: "ETC",
  XLTC: "LTC",
  XMLN: "MLN",
  XREP: "REP",
  XXLM: "XLM",
  XXMR: "XMR",
  XXRP: "XRP",
  XZEC: "ZEC",
  ZAUD: "AUD",
  ZCAD: "CAD",
  ZEUR: "EUR",
  ZGBP: "GBP",
  ZJPY: "JPY",
  ZUSD: "USD",
};
/** Fee credits, not something anyone holds. */
const NOT_ASSETS = new Set(["KFEE"]);

export interface ApiKeyInfo {
  apiKeyName?: string;
  permissions: string[];
  iban?: string;
}

interface KrakenResponse<T> {
  error: string[];
  result?: T;
}

/** A 200 answer whose `error` array isn't empty. */
export class KrakenApiError extends Error {
  constructor(readonly errors: string[]) {
    super(`Kraken answered ${errors.join(", ")}`);
    this.name = "KrakenApiError";
  }
}

const encoder = new TextEncoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * `API-Sign`: HMAC-SHA512 of (URI path + SHA256(nonce + POST data)), keyed with
 * the base64-decoded private key, in base64. The message is bytes: the path's
 * bytes followed by the raw 32-byte digest, never a string of the digest.
 */
export async function krakenSignature(path: string, nonce: string, postData: string, privateKey: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const digest = new Uint8Array(await subtle.digest("SHA-256", encoder.encode(nonce + postData)));
  const pathBytes = encoder.encode(path);
  const message = new Uint8Array(pathBytes.length + digest.length);
  message.set(pathBytes);
  message.set(digest, pathBytes.length);
  const key = await subtle.importKey("raw", fromBase64(privateKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return toBase64(await subtle.sign("HMAC", key, message));
}

/**
 * Nonces must always increase for a key, and Kraken can't lower the last one
 * it saw. Microseconds leave room above any millisecond nonce the key used
 * before, and the counter keeps two calls in the same millisecond apart.
 */
export function nonceClock(now: () => number = Date.now): () => string {
  let last = 0;
  return () => {
    last = Math.max(Math.floor(now()) * 1000, last + 1);
    return String(last);
  };
}

/** The currency a balance name stands for: `XXBT` → BTC, `ETH2.S` → ETH, `USD.M` → USD. */
export function assetCode(name: string): string {
  const base = name.split(".")[0].toUpperCase();
  return ALIASES[base] ?? base;
}

/** Distinct currencies with a positive balance. */
export function countAssets(balances: Record<string, string>): number {
  const held = new Set<string>();
  for (const [name, amount] of Object.entries(balances)) {
    const code = assetCode(name);
    if (!NOT_ASSETS.has(code) && Number.parseFloat(amount) > 0) held.add(code);
  }
  return held.size;
}

/** A short, stable id from the account's internal IBAN, so the IBAN itself isn't stored as an id. */
async function accountIdOf(iban: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(iban.replace(/\s+/g, ""))));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hasError(error: unknown, prefix: string): boolean {
  return error instanceof KrakenApiError && error.errors.some((e) => e.startsWith(prefix));
}

function explain(error: unknown): never {
  if (hasError(error, "EAPI:Invalid key")) throw new ConnectorError("Kraken refused this API key. It may have been deleted.");
  if (hasError(error, "EAPI:Invalid signature")) throw new ConnectorError("Kraken refused the signature, so the private key doesn't belong to this API key.");
  if (hasError(error, "EAPI:Invalid nonce")) {
    throw new ConnectorError("Kraken refused the request order, which happens when another app uses the same key. Create a key only for Flexwall.");
  }
  if (hasError(error, "EGeneral:Permission denied")) throw new ConnectorError("The key is missing a permission. Give it Query Funds.");
  if (hasError(error, "EAuth:Account temporary disabled")) throw new ConnectorError("Kraken has temporarily disabled this account. Contact Kraken support.");
  if (hasError(error, "EAuth:Account unconfirmed")) throw new ConnectorError("Kraken wants this account's email confirmed before its API can be used.");
  // Rate limits, lockouts, EService outages and HTTP errors pass through.
  throw error;
}

interface Credentials {
  key: string;
  secret: string;
}

export function makeKrakenConnector(now: () => number = Date.now): ConnectorDef {
  const nextNonce = nonceClock(now);

  async function call<T>(ctx: ConnectorContext, creds: Credentials, method: string, params: Record<string, string> = {}): Promise<T> {
    const path = `/0/private/${method}`;
    const nonce = nextNonce();
    const body = new URLSearchParams({ nonce, ...params }).toString();
    let sign: string;
    try {
      sign = await krakenSignature(path, nonce, body, creds.secret);
    } catch {
      throw new ConnectorError("The private key isn't valid: paste it exactly as Kraken showed it.");
    }
    const response = await ctx.fetch.json<KrakenResponse<T>>(`${API}${path}`, {
      method: "POST",
      headers: { "API-Key": creds.key, "API-Sign": sign, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (response.error?.length) throw new KrakenApiError(response.error);
    if (response.result === undefined) throw new Error(`Kraken answered ${method} without a result`);
    return response.result;
  }

  async function readValue(ctx: ConnectorContext, creds: Credentials): Promise<number> {
    let balance: { eb: string };
    try {
      balance = await call<{ eb: string }>(ctx, creds, "TradeBalance", { asset: "ZUSD" });
    } catch (error) {
      // Kraken's reference lists TradeBalance under Query Open Orders & Trades, its key guide under Query Funds.
      if (hasError(error, "EGeneral:Permission denied")) {
        throw new ConnectorError("Kraken won't show this key the total balance. Give it Query Open Orders & Trades as well as Query Funds.");
      }
      throw error;
    }
    const value = Number.parseFloat(balance.eb);
    if (!Number.isFinite(value)) throw new Error("Kraken answered TradeBalance without an equivalent balance");
    return value;
  }

  return defineConnector({
    id: "kraken",
    name: "Kraken",
    description: "Verified portfolio value and assets held on Kraken, read with a query-only API key.",
    homepage: "https://www.kraken.com",
    tier: "pro",
    verified: true,
    // Each key has a call counter of 15 to 20 that decays by 0.33 to 1 a second; a refresh costs 2 calls.
    ttl: 900,
    auth: {
      label: "Connect Kraken",
      help: "In Kraken, open Settings → API → Create API key. Tick Query Funds, and nothing that can deposit, withdraw, earn or trade: keys with those permissions are refused. Name the key Flexwall and use it nowhere else, since Kraken refuses requests when two apps share a key. Paste the API key and the private key.",
      fields: [
        field.secret("key", "API key", { maxLength: 200, pattern: "^[A-Za-z0-9+/=]{20,}$", patternMessage: "must be the API key exactly as Kraken shows it" }),
        field.secret("secret", "Private key", { maxLength: 200, pattern: "^[A-Za-z0-9+/]{40,}={0,2}$", patternMessage: "must be the private key exactly as Kraken shows it, in base64" }),
      ],
    },
    metrics: [
      {
        id: "portfolio-value",
        name: "Portfolio value",
        description: "Everything in the Kraken account, valued in US dollars by Kraken.",
        type: "number",
        unit: "currency",
        defaults: { label: "on Kraken" },
        leaderboard: "wealth",
        sensitive: true,
      },
      { id: "assets", name: "Assets held", description: "Currencies with a positive balance, staked ones counted once.", type: "number", unit: "count", defaults: { label: "assets on Kraken" } },
    ],

    // One pass over the account answers both.
    cacheKey: () => "account",

    async fetch({ metrics, secret }, ctx) {
      if (!secret?.key || !secret.secret) return {};
      const creds = { key: secret.key, secret: secret.secret };
      const wanted = new Set(metrics);
      const out: FetchResult = {};
      try {
        if (wanted.has("portfolio-value")) out["portfolio-value"] = money(Math.round(await readValue(ctx, creds)), "usd");
        if (wanted.has("assets")) out.assets = number(countAssets(await call<Record<string, string>>(ctx, creds, "Balance")), { unit: "count" });
      } catch (error) {
        explain(error);
      }
      return out;
    },

    async connect(input, ctx) {
      const creds = { key: String(input.key ?? "").trim(), secret: String(input.secret ?? "").trim() };
      try {
        // GetApiKeyInfo needs no permission, so it tells a bad key from a weak one and lists what the key can do.
        const info = await call<ApiKeyInfo>(ctx, creds, "GetApiKeyInfo");
        const dangerous = info.permissions.filter((p) => p in DANGEROUS_PERMISSIONS).map((p) => DANGEROUS_PERMISSIONS[p]);
        if (dangerous.length > 0) {
          throw new ConnectorError(`This key can do more than read: remove ${dangerous.join(", ")} in Kraken, or create a key with Query Funds only.`);
        }
        if (!info.permissions.includes("query-funds")) throw new ConnectorError("The key is missing a permission. Give it Query Funds.");
        // The cheapest call that proves the key reads what fetch needs.
        await readValue(ctx, creds);
        const name = info.apiKeyName?.trim();
        return {
          secret: creds,
          public: { hint: `…${creds.key.slice(-4)}`, ...(name ? { name } : {}) },
          label: name ? `Kraken (${name})` : "Kraken",
          ...(info.iban ? { accountId: await accountIdOf(info.iban) } : {}),
        };
      } catch (error) {
        explain(error);
      }
    },

    sample: {
      "portfolio-value": money(184_300, "usd"),
      assets: number(14, { unit: "count" }),
    },
  });
}

const krakenConnector = makeKrakenConnector();

export default definePlugin({
  id: "kraken",
  name: "Kraken",
  description: "Verified portfolio value and assets held on Kraken.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [krakenConnector],
});

export { krakenConnector };
