import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Coinbase, through the Advanced Trade API and a CDP secret API key with the
 * View permission only.
 *
 * Every request carries its own short JWT signed with the key (ES256, see
 * `coinbaseJwt`). Coinbase documents ECDSA keys only for these APIs: Ed25519
 * keys are refused with a sentence, even though WebCrypto could sign with them.
 *
 *  - `portfolio-value`: `GET /portfolios` lists the portfolios, then
 *    `GET /portfolios/{uuid}?currency=USD` gives each one's
 *    `portfolio_balances.total_balance`; the totals are summed.
 *  - `assets`: distinct assets with a positive balance across the spot
 *    positions of those breakdowns.
 *
 * Signing uses WebCrypto only: plugins are also bundled for the browser.
 */

const HOST = "api.coinbase.com";
const API = `https://${HOST}`;
/** Breakdowns read per refresh at most, all at once to stay inside the render budget. */
export const MAX_PORTFOLIOS = 20;
/** Coinbase accepts a JWT for two minutes at most. */
const JWT_SECONDS = 120;

const ED25519_REFUSED = "That's an Ed25519 key, and Coinbase's trading API only accepts ECDSA keys. Create a new key and pick ECDSA as its signature algorithm.";

export interface Portfolio {
  name: string;
  uuid: string;
  type: string;
  deleted?: boolean;
}
export interface Breakdown {
  portfolio?: Portfolio;
  portfolio_balances?: { total_balance?: { value: string; currency: string } };
  spot_positions?: { asset: string; total_balance_fiat?: number; total_balance_crypto?: number }[];
}
export interface KeyPermissions {
  can_view: boolean;
  can_trade: boolean;
  can_transfer: boolean;
  portfolio_uuid?: string;
  portfolio_type?: string;
}

const encoder = new TextEncoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- DER, just enough to rewrap an EC key -------------------------------------------------

const OID_EC_PUBLIC_KEY = [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
const OID_P256 = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const OID_ED25519 = [0x06, 0x03, 0x2b, 0x65, 0x70];

interface Tlv {
  tag: number;
  /** The whole element, header included. */
  start: number;
  /** Where the content starts and ends. */
  content: number;
  end: number;
}

function readTlv(der: Uint8Array, offset: number): Tlv {
  const tag = der[offset];
  let length = der[offset + 1];
  let content = offset + 2;
  if (length === undefined || tag === undefined) throw new Error("truncated DER");
  if (length & 0x80) {
    const bytes = length & 0x7f;
    if (bytes === 0 || bytes > 2) throw new Error("unsupported DER length");
    length = 0;
    for (let i = 0; i < bytes; i++) length = (length << 8) | der[content + i];
    content += bytes;
  }
  const end = content + length;
  if (end > der.length) throw new Error("truncated DER");
  return { tag, start: offset, content, end };
}

function encodeTlv(tag: number, content: readonly number[]): number[] {
  const n = content.length;
  const length = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return [tag, ...length, ...content];
}

function contains(haystack: Uint8Array, needle: readonly number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Coinbase hands out SEC1 keys ("EC PRIVATE KEY"); WebCrypto only imports
 * PKCS#8. PKCS#8 wraps the same ECPrivateKey with the algorithm and curve
 * named outside, so the inner copy of the curve ([0] parameters) is dropped,
 * as `openssl pkcs8 -topk8` does. Only P-256 is accepted: that's ES256.
 */
export function sec1ToPkcs8(sec1: Uint8Array): Uint8Array<ArrayBuffer> {
  const outer = readTlv(sec1, 0);
  if (outer.tag !== 0x30) throw new Error("not an EC private key");
  const kept: number[] = [];
  for (let offset = outer.content; offset < outer.end; ) {
    const child = readTlv(sec1, offset);
    const bytes = [...sec1.subarray(child.start, child.end)];
    if (child.tag === 0xa0) {
      if (!contains(sec1.subarray(child.content, child.end), OID_P256)) throw new Error("not a P-256 key");
    } else kept.push(...bytes);
    offset = child.end;
  }
  const inner = encodeTlv(0x30, kept);
  const algorithm = encodeTlv(0x30, [...OID_EC_PUBLIC_KEY, ...OID_P256]);
  return new Uint8Array(encodeTlv(0x30, [0x02, 0x01, 0x00, ...algorithm, ...encodeTlv(0x04, inner)]));
}

/**
 * The private key as PKCS#8 DER, from what the owner pasted. Accepts the PEM
 * with real newlines, with `\n` escapes (as in Coinbase's JSON download), or
 * with no newlines at all (a password field drops them).
 */
export function privateKeyDer(pasted: string): Uint8Array<ArrayBuffer> {
  const text = pasted.replace(/\\n/g, "\n").trim();
  const pem = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!pem) {
    // CDP shows Ed25519 secrets as bare base64 of 64 bytes.
    const bare = text.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(bare) && bare.length === 88) throw new ConnectorError(ED25519_REFUSED);
    throw new ConnectorError("The private key must be the whole key, from -----BEGIN EC PRIVATE KEY----- to -----END EC PRIVATE KEY-----.");
  }
  let der: Uint8Array<ArrayBuffer>;
  try {
    der = fromBase64(pem[2].replace(/\s+/g, ""));
  } catch {
    throw new ConnectorError("The private key isn't valid: paste it exactly as Coinbase showed it.");
  }
  if (pem[1] === "PRIVATE KEY" && contains(der, OID_ED25519)) throw new ConnectorError(ED25519_REFUSED);
  if (pem[1] === "PRIVATE KEY") return der;
  if (pem[1] !== "EC PRIVATE KEY") throw new ConnectorError("The private key must be an EC PRIVATE KEY, as Coinbase shows ECDSA keys.");
  try {
    return sec1ToPkcs8(der);
  } catch {
    throw new ConnectorError("The private key isn't a P-256 ECDSA key: paste it exactly as Coinbase showed it.");
  }
}

export async function importPrivateKey(pasted: string): Promise<CryptoKey> {
  const der = privateKeyDer(pasted);
  try {
    return await globalThis.crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch {
    throw new ConnectorError("The private key isn't a P-256 ECDSA key: paste it exactly as Coinbase showed it.");
  }
}

/** The `uri` claim: method, host and path, never the query string. */
export function jwtUri(method: "GET" | "POST", path: string): string {
  return `${method} ${HOST}${path.split("?")[0]}`;
}

/**
 * A JWT for one request, as Coinbase documents it: header `alg` ES256, `kid`
 * the key name, a random `nonce`; claims `sub` the key name, `iss` "cdp",
 * `nbf`, `exp` two minutes later, and `uri`. WebCrypto's ECDSA signature is
 * already the raw r‖s pair JWS wants.
 */
export async function coinbaseJwt(input: { keyName: string; key: CryptoKey; uri: string; nowSeconds: number; nonce: string }): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: input.keyName, nonce: input.nonce, typ: "JWT" }));
  const nbf = Math.floor(input.nowSeconds);
  const payload = base64url(JSON.stringify({ sub: input.keyName, iss: "cdp", nbf, exp: nbf + JWT_SECONDS, uri: input.uri }));
  const signature = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, input.key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

function randomNonce(): string {
  return [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sum of the portfolios' total balances, in dollars. */
export function totalValue(breakdowns: readonly Breakdown[]): number {
  let total = 0;
  for (const b of breakdowns) {
    const balance = b.portfolio_balances?.total_balance;
    if (!balance) continue;
    if (balance.currency && balance.currency.toUpperCase() !== "USD") throw new Error(`Coinbase valued a portfolio in ${balance.currency}, not USD`);
    total += Number.parseFloat(balance.value) || 0;
  }
  return total;
}

/** Distinct assets with a positive balance in any portfolio. */
export function countAssets(breakdowns: readonly Breakdown[]): number {
  const held = new Set<string>();
  for (const b of breakdowns) {
    for (const p of b.spot_positions ?? []) {
      if ((p.total_balance_crypto ?? 0) > 0 || (p.total_balance_fiat ?? 0) > 0) held.add(p.asset.toUpperCase());
    }
  }
  return held.size;
}

function explain(error: unknown): never {
  if (error instanceof HttpError && error.status === 401) {
    throw new ConnectorError("Coinbase refused this API key. It may have been deleted, or the private key doesn't belong to this key name.");
  }
  if (error instanceof HttpError && error.status === 403) {
    throw new ConnectorError("Coinbase refused access with this key. Give it the View permission, and if it has an IP allowlist, allow Flexwall's server.");
  }
  // Rate limits and outages pass through.
  throw error;
}

interface Credentials {
  keyName: string;
  privateKey: string;
}

export function makeCoinbaseConnector(clock: { now?: () => number; nonce?: () => string } = {}): ConnectorDef {
  const now = clock.now ?? Date.now;
  const nonce = clock.nonce ?? randomNonce;

  async function get<T>(ctx: ConnectorContext, keyName: string, key: CryptoKey, pathAndQuery: string): Promise<T> {
    const jwt = await coinbaseJwt({ keyName, key, uri: jwtUri("GET", pathAndQuery), nowSeconds: now() / 1000, nonce: nonce() });
    return ctx.fetch.json<T>(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${jwt}` } });
  }

  async function listPortfolios(ctx: ConnectorContext, keyName: string, key: CryptoKey): Promise<Portfolio[]> {
    const body = await get<{ portfolios?: Portfolio[] }>(ctx, keyName, key, "/api/v3/brokerage/portfolios");
    return (body.portfolios ?? []).filter((p) => !p.deleted);
  }

  async function readAccount(ctx: ConnectorContext, creds: Credentials, wanted: Set<string>): Promise<FetchResult> {
    const key = await importPrivateKey(creds.privateKey);
    const portfolios = await listPortfolios(ctx, creds.keyName, key);
    if (portfolios.length === 0) throw new ConnectorError("Coinbase lists no portfolio for this key.");
    if (portfolios.length > MAX_PORTFOLIOS) ctx.log(`${portfolios.length} portfolios: only the first ${MAX_PORTFOLIOS} are counted`);
    const breakdowns = await Promise.all(
      portfolios.slice(0, MAX_PORTFOLIOS).map(async (p) => {
        try {
          return (await get<{ breakdown: Breakdown }>(ctx, creds.keyName, key, `/api/v3/brokerage/portfolios/${encodeURIComponent(p.uuid)}?currency=USD`)).breakdown;
        } catch (error) {
          // A key restricted to one portfolio may still list the others.
          if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
            ctx.log(`coinbase portfolio breakdown answered ${error.status}: skipped`);
            return null;
          }
          throw error;
        }
      })
    );
    const readable = breakdowns.filter((b): b is Breakdown => b !== null);
    if (readable.length === 0) throw new ConnectorError("This key can't read the balance of any portfolio. Give it the View permission on the portfolio to show.");
    const out: FetchResult = {};
    if (wanted.has("portfolio-value")) out["portfolio-value"] = money(Math.round(totalValue(readable)), "usd");
    if (wanted.has("assets")) out.assets = number(countAssets(readable), { unit: "count" });
    return out;
  }

  return defineConnector({
    id: "coinbase",
    name: "Coinbase",
    description: "Verified portfolio value and assets held on Coinbase, read with a view-only API key.",
    homepage: "https://www.coinbase.com",
    tier: "pro",
    verified: true,
    // Coinbase publishes no limit for these endpoints, which would mean an hour;
    // a crypto balance moves with prices all day, so 15 minutes, at one call
    // per portfolio plus the list (21 at most).
    ttl: 900,
    auth: {
      label: "Connect Coinbase",
      help: "In the Coinbase Developer Platform, open API Keys → Secret API Keys → Create API key. Under API restrictions tick View only, not Trade or Transfer: keys that can trade or move funds are refused. Under Advanced Settings pick ECDSA as the signature algorithm, since Ed25519 keys don't work with Coinbase's trading API. Paste the key name (organizations/…/apiKeys/…) and the private key.",
      fields: [
        field.text("keyName", "API key name", {
          placeholder: "organizations/…/apiKeys/…",
          maxLength: 200,
          pattern: "^(organizations/[A-Za-z0-9-]+/apiKeys/)?[A-Za-z0-9-]+$",
          patternMessage: "must look like organizations/…/apiKeys/…",
        }),
        field.secret("privateKey", "Private key", { placeholder: "-----BEGIN EC PRIVATE KEY-----…", maxLength: 1000 }),
      ],
    },
    metrics: [
      {
        id: "portfolio-value",
        name: "Portfolio value",
        description: "The total balance of every portfolio, valued in US dollars by Coinbase.",
        type: "number",
        unit: "currency",
        defaults: { label: "on Coinbase" },
        leaderboard: "wealth",
        sensitive: true,
      },
      { id: "assets", name: "Assets held", description: "Distinct assets with a positive balance across portfolios.", type: "number", unit: "count", defaults: { label: "assets on Coinbase" } },
    ],

    // The same portfolio breakdowns answer both.
    cacheKey: () => "account",

    async fetch({ metrics, secret }, ctx) {
      if (!secret?.keyName || !secret.privateKey) return {};
      try {
        return await readAccount(ctx, { keyName: secret.keyName, privateKey: secret.privateKey }, new Set(metrics));
      } catch (error) {
        explain(error);
      }
    },

    async connect(input, ctx) {
      const keyName = String(input.keyName ?? "").trim();
      const privateKey = String(input.privateKey ?? "").trim();
      // A key Coinbase would refuse is refused here, before any request.
      const key = await importPrivateKey(privateKey);
      try {
        const permissions = await get<KeyPermissions>(ctx, keyName, key, "/api/v3/brokerage/key_permissions");
        const extra = [permissions.can_trade ? "Trade" : null, permissions.can_transfer ? "Transfer" : null].filter(Boolean);
        if (extra.length > 0) throw new ConnectorError(`This key can do more than view: create a key with View only, without ${extra.join(" or ")}.`);
        if (!permissions.can_view) throw new ConnectorError("The key can't view the account. Create a key with the View permission.");
        const portfolios = await listPortfolios(ctx, keyName, key);
        const own = portfolios.find((p) => p.uuid === permissions.portfolio_uuid);
        return {
          // The key name is sent in every JWT, so it lives with the private key; fetch reads both from `secret`.
          secret: { keyName, privateKey },
          public: { hint: `…${keyName.slice(-4)}`, ...(own ? { portfolio: own.name } : {}) },
          label: own ? `Coinbase (${own.name})` : "Coinbase",
          ...(permissions.portfolio_uuid ? { accountId: permissions.portfolio_uuid } : {}),
        };
      } catch (error) {
        explain(error);
      }
    },

    sample: {
      "portfolio-value": money(312_400, "usd"),
      assets: number(9, { unit: "count" }),
    },
  });
}

const coinbaseConnector = makeCoinbaseConnector();

export default definePlugin({
  id: "coinbase",
  name: "Coinbase",
  description: "Verified portfolio value and assets held on Coinbase.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [coinbaseConnector],
});

export { coinbaseConnector };
