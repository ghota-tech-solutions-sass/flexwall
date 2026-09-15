import { ConnectorError, defineConnector, definePlugin, HttpError, money, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Brokerage accounts worldwide through SnapTrade's Connection Portal.
 *
 * The Flexwall server owns one Commercial SnapTrade API key: its client id
 * (SNAPTRADE_CLIENT_ID) and consumer key (SNAPTRADE_CONSUMER_KEY). Every call
 * is signed with HMAC-SHA256 (see `snaptradeSignature`). Each Flexwall
 * connection is its own SnapTrade user:
 *
 *  - `authorize`: `POST /snapTrade/registerUser` with a fresh random userId
 *    (the answer carries its userSecret), then `POST /snapTrade/login` for that
 *    user gives the Connection Portal address. The user's id and secret travel
 *    in `carry`, sealed by the host, never in the portal URL.
 *  - `complete`: the portal sends the owner back with `status`; then
 *    `GET /authorizations` proves a brokerage was connected and names it.
 *  - `fetch`: `GET /authorizations` (only it says a connection is disabled)
 *    and `GET /accounts` (every account's total, one call); cash needs
 *    `GET /accounts/{id}/balances` per account, only when asked for.
 *
 * SnapTrade keeps connections alive by itself, so there is no `expiresAt` and
 * no `refresh`: a broken connection shows up as `disabled` and the owner is
 * asked to reconnect.
 */

export const API = "https://api.snaptrade.com";
/** Accounts whose cash is read per refresh at most: one request each. */
export const MAX_ACCOUNTS = 10;

export interface Brokerage {
  name?: string;
  display_name?: string;
  slug?: string;
}
export interface Connection {
  id: string;
  brokerage?: Brokerage;
  disabled?: boolean;
  type?: string;
}
export interface Account {
  id: string;
  brokerage_authorization?: string;
  name?: string | null;
  institution_name?: string;
  balance?: { total?: { amount?: number | null; currency?: string | null } | null } | null;
  status?: string | null;
  account_category?: string | null;
  is_paper?: boolean;
}
export interface Balance {
  currency?: { code?: string } | null;
  cash?: number | null;
}

const NO_APP = "This Flexwall server has no SnapTrade app.";
const APP_REFUSED = "SnapTrade refused this Flexwall server's API key.";
const USER_GONE = "SnapTrade no longer knows this connection. Remove it and connect your brokerage again.";
const NOTHING_CONNECTED = "No brokerage was connected.";

/** Lines of credit report debt, not wealth. `null` counts: SnapTrade says to treat it as an investment account. */
const NOT_COUNTED_CATEGORIES = new Set(["LOC"]);
const NOT_COUNTED_STATUSES = new Set(["closed", "archived"]);

const encoder = new TextEncoder();

/**
 * JSON with object keys sorted at every level and no whitespace: what
 * SnapTrade signs ("Canonical JSON Rules" in its Request Signatures guide).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * The `Signature` header: base64 of HMAC-SHA256, keyed with the consumer key,
 * over the canonical JSON of `{ content, path, query }`. `content` is the JSON
 * body, `null` without one; `path` excludes the query; `query` is the exact
 * query string sent, without `?`. The official SDKs pass the key through
 * `encodeURI` first, which changes nothing for the URL-safe keys SnapTrade issues.
 */
export async function snaptradeSignature(consumerKey: string, payload: { content: unknown; path: string; query: string }): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(encodeURI(consumerKey)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = canonicalJson({ content: payload.content ?? null, path: payload.path, query: payload.query });
  return base64(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

/** SnapTrade's error `code`, e.g. "1076" (signature) or "1083" (user id or secret). */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  try {
    const body = JSON.parse(error.body) as { code?: unknown; default_code?: unknown };
    const code = body.code ?? body.default_code;
    return code === undefined || code === null ? null : String(code);
  } catch {
    return null;
  }
}

/**
 * Turns what the owner or operator can fix into a sentence; the rest
 * (outages, 429, anything unexpected) passes through. Never echoes
 * `error.url` or `error.body`: the URL carries the user secret.
 *
 * `1076` is a refused signature only on a 401: the registerUser reference
 * also documents a 400 with `1076` ("Unable to verify data sent"), which is
 * about the request, not the key. Other 401s on a user call mean the user id
 * or secret (the portal documents `0000` "User not found"); a 403 means the
 * key lacks a permission (login documents `1066`).
 */
function explain(error: unknown, withUser: boolean): never {
  if (error instanceof HttpError) {
    const code = errorCode(error);
    if (/throttl|rate limit|quota/i.test(error.body)) throw error;
    if (error.status === 401 && code === "1076") throw new ConnectorError(APP_REFUSED);
    if (code === "1083") throw new ConnectorError(USER_GONE);
    if (error.status === 401) throw new ConnectorError(withUser ? USER_GONE : APP_REFUSED);
    if (error.status === 403) throw new ConnectorError(APP_REFUSED);
    if (error.status === 402) throw new ConnectorError("This Flexwall server's SnapTrade plan doesn't allow this. Ask its operator.");
  }
  throw error;
}

/** "Robinhood", "Fidelity and Robinhood", "Fidelity, Questrade and Robinhood". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "your brokerage";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const brokerageName = (c: Connection) => c.brokerage?.display_name?.trim() || c.brokerage?.name?.trim() || "your brokerage";
const uniqueNames = (connections: readonly Connection[]) => [...new Set(connections.map(brokerageName))].sort((a, b) => a.localeCompare(b));

/** Real, open accounts that hold the owner's money. */
export function countedAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => a.id && !a.is_paper && !NOT_COUNTED_STATUSES.has(String(a.status ?? "").toLowerCase()) && !NOT_COUNTED_CATEGORIES.has(String(a.account_category ?? "").toUpperCase()));
}

export interface Amount {
  amount: number;
  currency: string;
}

/**
 * The currency rule: the currency of the single largest amount wins, and only
 * amounts in that currency are added. SnapTrade reports each account in its
 * own currency with no common one, and Flexwall converts nothing.
 */
export function sumInLargestCurrency(amounts: readonly Amount[], preferred?: string): { total: number; currency: string; skipped: number } | null {
  const usable = amounts.filter((a) => Number.isFinite(a.amount) && a.currency);
  if (usable.length === 0) return null;
  const largest = usable.reduce((top, a) => (a.amount > top.amount ? a : top)).currency.toUpperCase();
  // A preferred currency (the portfolio's) only wins when some amount is in it.
  const currency = preferred && usable.some((a) => a.currency.toUpperCase() === preferred.toUpperCase()) ? preferred.toUpperCase() : largest;
  let total = 0;
  let skipped = 0;
  for (const a of usable) {
    if (a.currency.toUpperCase() === currency) total += a.amount;
    else skipped++;
  }
  return { total: Math.round(total * 100) / 100, currency, skipped };
}

export function makeSnaptradeConnector(deps: { now?: () => number; newUserId?: () => string } = {}): ConnectorDef {
  const now = deps.now ?? Date.now;
  const newUserId = deps.newUserId ?? (() => `flexwall-${globalThis.crypto.randomUUID()}`);

  function serverApp(ctx: ConnectorContext): { clientId: string; consumerKey: string } {
    const clientId = ctx.env("SNAPTRADE_CLIENT_ID")?.trim();
    const consumerKey = ctx.env("SNAPTRADE_CONSUMER_KEY")?.trim();
    if (!clientId || !consumerKey) throw new ConnectorError(NO_APP);
    return { clientId, consumerKey };
  }

  /**
   * One signed call. The query string is built once and used both in the URL
   * and in the signature. SnapTrade only accepts the user id and secret as
   * query parameters: there is no header for them.
   */
  async function call<T>(
    ctx: ConnectorContext,
    app: { clientId: string; consumerKey: string },
    path: string,
    opts: { method?: "GET" | "POST"; user?: { userId: string; userSecret: string }; body?: Record<string, unknown>; timeoutMs?: number } = {}
  ): Promise<T> {
    const params = new URLSearchParams({ clientId: app.clientId, timestamp: String(Math.floor(now() / 1000)) });
    if (opts.user) {
      params.set("userId", opts.user.userId);
      params.set("userSecret", opts.user.userSecret);
    }
    const query = params.toString();
    const content = opts.body && Object.keys(opts.body).length > 0 ? opts.body : null;
    const signature = await snaptradeSignature(app.consumerKey, { content, path, query });
    const headers: Record<string, string> = { Signature: signature, Accept: "application/json" };
    if (content) headers["Content-Type"] = "application/json";
    return ctx.fetch.json<T>(`${API}${path}?${query}`, {
      method: opts.method ?? "GET",
      headers,
      ...(content ? { body: canonicalJson(content) } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
  }

  async function signed<T>(...args: Parameters<typeof call>): Promise<T> {
    try {
      return await call<T>(...args);
    } catch (error) {
      explain(error, Boolean(args[3]?.user));
    }
  }

  return defineConnector({
    id: "snaptrade",
    name: "SnapTrade",
    description: "Verified value and cash of your brokerage accounts worldwide, read through SnapTrade.",
    homepage: "https://snaptrade.com",
    // SnapTrade bills the server's operator for every connected user, every month.
    tier: "pro",
    verified: true,
    // `GET /accounts` serves Daily data on every SnapTrade plan: cached and
    // refreshed once a day. Reading it every 6 hours catches that refresh the
    // same morning without polling a number that can't have moved.
    ttl: 6 * 3600,
    auth: {
      label: "Connect a brokerage",
      help: "You'll pick your brokerage in SnapTrade's Connection Portal and sign in there. The connection is read-only: Flexwall reads account values and cash, never trades or moves money. Your brokerage password goes to SnapTrade and your brokerage, never to Flexwall. Supported brokerages: support.snaptrade.com/brokerages.",
      fields: [],
      oauth: {
        async authorize({ redirectUri, state }, ctx) {
          const app = serverApp(ctx);
          const userId = newUserId();
          const registered = await signed<{ userId?: string; userSecret?: string }>(ctx, app, "/snapTrade/registerUser", { method: "POST", body: { userId } });
          if (!registered?.userSecret) throw new Error("SnapTrade answered registerUser without a userSecret");
          const user = { userId, userSecret: registered.userSecret };

          // The host checks `state` on return; SnapTrade appends its own `status` parameters to this address.
          const customRedirect = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${new URLSearchParams({ state })}`;
          const login = await signed<{ redirectURI?: string }>(ctx, app, "/snapTrade/login", {
            method: "POST",
            user,
            body: { connectionType: "read", customRedirect, immediateRedirect: true },
          });
          if (!login?.redirectURI?.startsWith("https://")) throw new Error("SnapTrade answered login without a Connection Portal address");
          return { url: login.redirectURI, carry: user };
        },

        async complete({ query, carry }, ctx) {
          const app = serverApp(ctx);
          const status = String(query.status ?? "").toUpperCase();
          if (status === "ABANDONED") throw new ConnectorError("You left SnapTrade before connecting a brokerage, so nothing was connected.");
          if (status === "ERROR") {
            const code = String(query.error_code ?? "");
            if (code === "1066") throw new ConnectorError("Your brokerage refused those credentials, so nothing was connected. Try again.");
            if (code === "3000") throw new ConnectorError("SnapTrade couldn't reach your brokerage, so nothing was connected. Try again later.");
            if (code === "1006") throw new ConnectorError("That SnapTrade sign-in expired, so nothing was connected. Connect again.");
            throw new ConnectorError("SnapTrade couldn't connect your brokerage, so nothing was connected. Try again.");
          }
          if (!carry.userId || !carry.userSecret) throw new ConnectorError("That SnapTrade sign-in expired, so nothing was connected. Connect again.");
          const user = { userId: carry.userId, userSecret: carry.userSecret };

          // Existence comes from connections: a new connection's accounts can lag its first sync.
          const [connections, accounts] = await Promise.all([
            signed<Connection[]>(ctx, app, "/authorizations", { user }),
            signed<Account[]>(ctx, app, "/accounts", { user }).catch((error: unknown) => {
              if (error instanceof ConnectorError) throw error;
              ctx.log("snaptrade accounts not readable right after connecting: counted later");
              return [] as Account[];
            }),
          ]);
          if (!Array.isArray(connections) || connections.length === 0) throw new ConnectorError(`${NOTHING_CONNECTED} Connect again and finish signing in at your brokerage.`);

          const names = uniqueNames(connections);
          const counted = countedAccounts(Array.isArray(accounts) ? accounts : []);
          return {
            secret: user,
            public: { brokerages: names.join(", "), accounts: String(counted.length) },
            label: names.join(", "),
            // A random id per sign-in: stable for this connection, never shared by two.
            accountId: user.userId,
          };
        },
      },
    },
    metrics: [
      {
        id: "portfolio-value",
        name: "Portfolio value",
        description: "Total value of your brokerage accounts (cash and holdings), added up in the currency of your largest account.",
        type: "number",
        unit: "currency",
        defaults: { label: "invested" },
        leaderboard: "wealth",
        sensitive: true,
      },
      {
        id: "cash",
        name: "Cash",
        description: "Cash in your brokerage accounts, added up in the currency of your largest account.",
        type: "number",
        unit: "currency",
        defaults: { label: "in cash" },
        sensitive: true,
      },
      { id: "accounts", name: "Accounts", description: "Open brokerage accounts connected through SnapTrade.", type: "number", unit: "count", defaults: { label: "brokerage accounts" } },
    ],

    // One pass: connections and accounts answer everything, cash adds one call per account.
    cacheKey: () => "portfolio",

    async fetch({ metrics, secret }, ctx) {
      const app = serverApp(ctx);
      if (!secret?.userId || !secret?.userSecret) throw new ConnectorError(USER_GONE);
      const user = { userId: secret.userId, userSecret: secret.userSecret };

      // A disabled connection still answers with its last cached numbers and no
      // error: `disabled` on the connections list is the only way to know.
      const [connections, accounts] = await Promise.all([signed<Connection[]>(ctx, app, "/authorizations", { user }), signed<Account[]>(ctx, app, "/accounts", { user })]);
      const list = Array.isArray(connections) ? connections : [];
      if (list.length === 0) throw new ConnectorError(`${NOTHING_CONNECTED} Connect your brokerage again.`);
      const disabled = list.filter((c) => c.disabled);
      if (disabled.length > 0) {
        throw new ConnectorError(`Reconnect ${listNames(uniqueNames(disabled))} in SnapTrade: the brokerage stopped sharing, so the numbers would be out of date. Connect your brokerage again.`);
      }

      const counted = countedAccounts(Array.isArray(accounts) ? accounts : []);
      const out: FetchResult = {};
      if (metrics.includes("accounts")) out.accounts = number(counted.length, { unit: "count" });

      const totals: Amount[] = counted.flatMap((a) => {
        const t = a.balance?.total;
        return t && typeof t.amount === "number" && t.currency ? [{ amount: t.amount, currency: t.currency }] : [];
      });
      const value = sumInLargestCurrency(totals);
      if (metrics.includes("portfolio-value")) {
        if (value && value.skipped > 0) ctx.log(`${value.skipped} snaptrade account(s) in another currency than ${value.currency}: left out`);
        out["portfolio-value"] = value ? money(value.total, value.currency) : null;
      }

      if (metrics.includes("cash")) {
        if (counted.length > MAX_ACCOUNTS) ctx.log(`${counted.length} snaptrade accounts: cash of the first ${MAX_ACCOUNTS} only`);
        const perAccount = await Promise.all(
          counted.slice(0, MAX_ACCOUNTS).map((a) => signed<Balance[]>(ctx, app, `/accounts/${encodeURIComponent(a.id)}/balances`, { user, timeoutMs: 15_000 }))
        );
        const cash: Amount[] = perAccount.flatMap((balances) =>
          (Array.isArray(balances) ? balances : []).flatMap((b) => (typeof b.cash === "number" && b.currency?.code ? [{ amount: b.cash, currency: b.currency.code }] : []))
        );
        const sum = sumInLargestCurrency(cash, value?.currency);
        if (sum && sum.skipped > 0) ctx.log(`${sum.skipped} snaptrade cash balance(s) in another currency than ${sum.currency}: left out`);
        out.cash = sum ? money(sum.total, sum.currency) : null;
      }
      return out;
    },

    sample: {
      "portfolio-value": money(184_500, "usd"),
      cash: money(12_300, "usd"),
      accounts: number(3, { unit: "count" }),
    },
  });
}

const snaptradeConnector = makeSnaptradeConnector();

export default definePlugin({
  id: "snaptrade",
  name: "SnapTrade",
  description: "Verified brokerage account values worldwide, through SnapTrade.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [snaptradeConnector],
});

export { snaptradeConnector };
