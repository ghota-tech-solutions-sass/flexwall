import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, type ConnectorContext, type FetchResult, type ServerStatus } from "@flexwall/sdk";

/**
 * Bank, card, loan and investment balances of US and Canadian institutions,
 * through Plaid Hosted Link.
 *
 * The Flexwall server owns one Plaid app: PLAID_CLIENT_ID, PLAID_SECRET and
 * PLAID_ENV (sandbox or production). Both keys travel in the PLAID-CLIENT-ID
 * and PLAID-SECRET headers, which Plaid accepts instead of the JSON body.
 *
 *  - `authorize`: `POST /link/token/create` with a `hosted_link` object gives a
 *    `hosted_link_url` on secure.plaid.com. Plaid runs the whole flow there,
 *    OAuth banks included, then opens `completion_redirect_uri`, which carries
 *    the host's state.
 *  - `complete`: `POST /link/token/get` lists the Link sessions of that token
 *    (kept six hours); the public token of the latest finished one goes to
 *    `POST /item/public_token/exchange` for a permanent access token. Plaid
 *    opens the completion address on exit too, so a session without a public
 *    token means nothing was connected.
 *  - `fetch`: `POST /accounts/get`, Plaid's free cached balances, refreshed
 *    about daily because the Item has Transactions. `/investments/holdings/get`
 *    only when an investment account comes without a balance.
 *
 * US and Canadian access tokens don't expire, so there is no `expiresAt` and
 * no `refresh`. When the bank wants the owner back (ITEM_LOGIN_REQUIRED),
 * Plaid's answer is Link update mode, which the host doesn't offer: the owner
 * connects again.
 */

export const HOSTS = { sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" } as const;

/**
 * `transactions` is required: `products` can't be empty, `balance` isn't a
 * valid value, and an Item with only Auth or Identity refreshes its cached
 * balances every 30 days or less. Transactions (or Investments) makes
 * `/accounts/get` about daily. `investments` is optional so banks without it
 * still show; Plaid adds it where the institution supports it.
 */
export const PRODUCTS = ["transactions"] as const;
export const OPTIONAL_PRODUCTS = ["investments"] as const;

const TIMEOUT_MS = 15_000;
const NO_APP = "This Flexwall server has no Plaid app.";
const NOT_FINISHED = "The bank connection didn't finish.";

export const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];

export interface Balances {
  available?: number | null;
  current?: number | null;
  limit?: number | null;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
}
export interface Account {
  account_id: string;
  type: string;
  subtype?: string | null;
  mask?: string | null;
  balances: Balances;
}
export interface Holding {
  account_id: string;
  institution_value?: number | null;
  iso_currency_code?: string | null;
}
interface SessionAccount {
  id?: string;
  type?: string | null;
  subtype?: string | null;
  mask?: string | null;
}
interface ItemAddResult {
  public_token?: string;
  accounts?: SessionAccount[];
  institution?: { institution_id?: string | null; name?: string | null } | null;
}
export interface LinkSession {
  link_session_id: string;
  started_at?: string;
  finished_at?: string | null;
  results?: { item_add_results?: ItemAddResult[] } | null;
  on_success?: { public_token?: string; metadata?: { accounts?: SessionAccount[]; institution?: ItemAddResult["institution"] } } | null;
}

/** Which total an account type counts in. `other` accounts count nowhere. `brokerage` is the pre-2018 name of `investment`. */
export type Bucket = "cash" | "investments" | "debt";
export function bucketOf(type: string): Bucket | null {
  switch (type) {
    case "depository":
      return "cash";
    case "investment":
    case "brokerage":
      return "investments";
    case "credit":
    case "loan":
      return "debt";
    default:
      return null;
  }
}

/** The `error_code` of a Plaid error body. Plaid asks clients to branch on it: nearly every error is a 400. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  try {
    const body = JSON.parse(error.body) as { error_code?: unknown };
    return typeof body.error_code === "string" ? body.error_code : null;
  } catch {
    return null;
  }
}

/** The most common ISO currency among accounts; ties go to the first code alphabetically, so the pick doesn't depend on order. */
export function mainCurrency(accounts: readonly Account[]): string | null {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    const code = a.balances.iso_currency_code?.toUpperCase();
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [code, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (best === null || n > counts.get(best)!) best = code;
  }
  return best;
}

const cents = (n: number) => Math.round(n * 100) / 100;
const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Server {
  base: string;
  headers: Record<string, string>;
}

/** The server's Plaid app, or a sentence before any request. */
function server(ctx: ConnectorContext): Server {
  const app = configuredServer(ctx);
  if (!app) throw new ConnectorError(NO_APP);
  return app;
}

/** The server's Plaid keys, or null when either is missing. */
function keys(ctx: ConnectorContext): { clientId: string; secret: string } | null {
  const clientId = ctx.env("PLAID_CLIENT_ID")?.trim();
  const secret = ctx.env("PLAID_SECRET")?.trim();
  return clientId && secret ? { clientId, secret } : null;
}

/**
 * Which Plaid PLAID_ENV names. Only `production` is production: unset, and
 * anything else, reads as sandbox, so no back office ever guesses production.
 * `configuredServer` still refuses an unrecognised value before any request.
 */
function environment(ctx: ConnectorContext): ServerStatus["environment"] {
  return ctx.env("PLAID_ENV")?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

/** The server's Plaid app, or null when its keys aren't set. */
function configuredServer(ctx: ConnectorContext): Server | null {
  const pair = keys(ctx);
  if (!pair) return null;
  const env = (ctx.env("PLAID_ENV")?.trim() || "sandbox").toLowerCase();
  if (env !== "sandbox" && env !== "production") throw new ConnectorError("This Flexwall server's PLAID_ENV must be sandbox or production.");
  return { base: HOSTS[env], headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": pair.clientId, "PLAID-SECRET": pair.secret } };
}

function post<T>(ctx: ConnectorContext, app: Server, path: string, body: Record<string, unknown>, maxBytes?: number): Promise<T> {
  return ctx.fetch.json<T>(`${app.base}${path}`, { method: "POST", headers: app.headers, body: JSON.stringify(body), timeoutMs: TIMEOUT_MS, ...(maxBytes ? { maxBytes } : {}) });
}

/** Errors about the server's keys. Anything else, rate limits (429) and outages included, passes through. */
function explainServer(error: unknown): never {
  const code = errorCode(error);
  if (code === "INVALID_API_KEYS") throw new ConnectorError("Plaid refused this Flexwall server's keys.");
  if (code === "UNAUTHORIZED_ENVIRONMENT") throw new ConnectorError("This Flexwall server's Plaid app isn't allowed in this Plaid environment.");
  throw error;
}

/** Errors about the owner's Item: they can fix these by connecting again. */
function explainItem(error: unknown, institution: string): never {
  const code = errorCode(error);
  if (code === "ITEM_LOGIN_REQUIRED") throw new ConnectorError(`Reconnect ${institution} in Plaid: the bank wants you to sign in again.`);
  if (code === "ACCESS_NOT_GRANTED" || code === "NO_ACCOUNTS") throw new ConnectorError(`Reconnect ${institution} in Plaid: it no longer shares these accounts.`);
  if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN") throw new ConnectorError(`Reconnect ${institution} in Plaid: this connection was removed or belongs to another Plaid environment.`);
  explainServer(error);
}

/** The latest session that produced a public token, with what Link said about it. */
export function finishedItem(sessions: readonly LinkSession[]): ItemAddResult | null {
  const when = (s: LinkSession) => s.finished_at ?? s.started_at ?? "";
  const latestFirst = [...sessions].sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : 0));
  for (const session of latestFirst) {
    const added = session.results?.item_add_results?.find((r) => r.public_token);
    if (added) return added;
    // Older integrations only get the deprecated on_success object.
    if (session.on_success?.public_token) return { public_token: session.on_success.public_token, ...session.on_success.metadata };
  }
  return null;
}

export const plaidConnector = defineConnector({
  id: "plaid",
  name: "Plaid",
  description: "Verified cash, investments and net worth from your US or Canadian bank and brokerage accounts, read through Plaid.",
  homepage: "https://plaid.com",
  tier: "pro",
  verified: true,
  // Cached balances move about once a day; /accounts/get is free but limited to 15 calls a minute per Item.
  ttl: 6 * 3600,
  auth: {
    label: "Connect a US or Canadian bank",
    help: "Choose your bank's country. On Plaid's page you'll find your bank, sign in and choose which accounts to share. Flexwall only reads balances: it never shows transactions and can't move money. Plaid asks for transactions access because that's what keeps balances fresh every day. If your bank later asks you to sign in again, connect it again.",
    fields: [field.select("country", "Country", COUNTRIES, { default: "US" })],
    oauth: {
      async authorize({ fields, redirectUri, state }, ctx) {
        const app = server(ctx);
        const country = String(fields.country) === "CA" ? "CA" : "US";
        const body = {
          client_name: "Flexwall",
          language: "en",
          country_codes: [country],
          // A fresh id per sign-in: no Flexwall user id reaches Plaid.
          user: { client_user_id: globalThis.crypto.randomUUID() },
          products: PRODUCTS,
          optional_products: OPTIONAL_PRODUCTS,
          // Plaid documents no parameter of its own on this redirect, so the host's state rides in it.
          hosted_link: { completion_redirect_uri: `${redirectUri}?state=${encodeURIComponent(state)}` },
        };
        let created: { link_token?: string; hosted_link_url?: string };
        try {
          created = await post(ctx, app, "/link/token/create", body);
        } catch (error) {
          explainServer(error);
        }
        if (!created.link_token || !created.hosted_link_url?.startsWith("https://")) throw new Error("Plaid answered /link/token/create without a Hosted Link address");
        return { url: created.hosted_link_url, carry: { linkToken: created.link_token } };
      },

      async complete({ carry, fields }, ctx) {
        const app = server(ctx);
        if (!carry.linkToken) throw new ConnectorError(NOT_FINISHED);
        let token: { link_sessions?: LinkSession[] };
        try {
          token = await post(ctx, app, "/link/token/get", { link_token: carry.linkToken });
        } catch (error) {
          if (errorCode(error) === "INVALID_LINK_TOKEN") throw new ConnectorError(NOT_FINISHED);
          explainServer(error);
        }
        const added = finishedItem(token.link_sessions ?? []);
        if (!added?.public_token) throw new ConnectorError(NOT_FINISHED);

        let exchanged: { access_token?: string; item_id?: string };
        try {
          exchanged = await post(ctx, app, "/item/public_token/exchange", { public_token: added.public_token });
        } catch (error) {
          if (errorCode(error) === "INVALID_PUBLIC_TOKEN") throw new ConnectorError("That Plaid sign-in expired or was already used. Connect again.");
          explainServer(error);
        }
        if (!exchanged.access_token) throw new Error("Plaid answered /item/public_token/exchange without an access token");

        const institution = added.institution?.name?.trim() || "Your bank";
        const accounts = added.accounts ?? [];
        const country = String(fields.country) === "CA" ? "CA" : "US";
        // item_id changes on every link, so it can't recognise a reconnect: the institution and the shared accounts can.
        const shape = accounts.map((a) => `${a.type ?? ""}/${a.subtype ?? ""}/${a.mask ?? ""}`).sort();
        const accountId = added.institution?.institution_id && shape.length > 0 ? await sha256Hex(`${added.institution.institution_id}|${shape.join(",")}`) : exchanged.item_id;
        return {
          secret: { accessToken: exchanged.access_token },
          public: { institution, country, accounts: String(accounts.length) },
          label: institution,
          ...(accountId ? { accountId } : {}),
        };
      },
    },

    /**
     * `POST /item/remove` ends the Item's subscriptions (billed per Item) and
     * invalidates its access token. An Item Plaid can't find, or a token it
     * doesn't know (removed already, or from another environment), is done.
     */
    async disconnect({ secret }, ctx) {
      const app = configuredServer(ctx);
      if (!app || !secret.accessToken) return;
      try {
        await post(ctx, app, "/item/remove", { access_token: secret.accessToken });
      } catch (error) {
        const code = errorCode(error);
        if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN") return;
        explainServer(error);
      }
    },
  },

  server(ctx) {
    const env = environment(ctx);
    return { configured: keys(ctx) !== null, environment: env, detail: HOSTS[env] };
  },

  metrics: [
    {
      id: "cash",
      name: "Cash",
      description: "Current balance of the shared checking, savings and other deposit accounts.",
      type: "number",
      unit: "currency",
      defaults: { label: "in the bank" },
      sensitive: true,
    },
    {
      id: "investments",
      name: "Investments",
      description: "Value of the shared brokerage and retirement accounts, as the institution reports it.",
      type: "number",
      unit: "currency",
      defaults: { label: "invested" },
      sensitive: true,
    },
    {
      id: "net-worth",
      name: "Net worth",
      description: "Cash plus investments, less what's owed on the shared credit cards and loans.",
      type: "number",
      unit: "currency",
      defaults: { label: "net worth" },
      leaderboard: "wealth",
      sensitive: true,
    },
  ],

  // One /accounts/get answers all three.
  cacheKey: () => "accounts",

  async fetch({ metrics, secret, public: shown }, ctx) {
    const app = server(ctx);
    const institution = shown?.institution || "your bank";
    const accessToken = secret?.accessToken;
    if (!accessToken) throw new ConnectorError(`Reconnect ${institution} in Plaid.`);

    const wantCash = metrics.includes("cash") || metrics.includes("net-worth");
    const wantInvestments = metrics.includes("investments") || metrics.includes("net-worth");
    const wantDebt = metrics.includes("net-worth");
    if (!wantCash && !wantInvestments) return {};

    let listed: { accounts?: Account[] };
    try {
      listed = await post(ctx, app, "/accounts/get", { access_token: accessToken });
    } catch (error) {
      explainItem(error, institution);
    }

    const counted = (listed.accounts ?? []).filter((a) => a.balances && bucketOf(a.type) !== null);
    const unofficial = counted.filter((a) => !a.balances.iso_currency_code).length;
    if (unofficial > 0) ctx.log(`plaid: ${unofficial} account(s) without an ISO currency (crypto or unofficial): left out`);
    const currency = mainCurrency(counted) ?? (shown?.country === "CA" ? "CAD" : "USD");
    const inCurrency = counted.filter((a) => a.balances.iso_currency_code?.toUpperCase() === currency);
    const otherCurrency = counted.length - unofficial - inCurrency.length;
    if (otherCurrency > 0) ctx.log(`plaid: ${otherCurrency} account(s) in another currency than ${currency}: left out`);

    const totals = { cash: 0, investments: 0, debt: 0 };
    const unvalued: string[] = [];
    for (const account of inCurrency) {
      const bucket = bucketOf(account.type)!;
      const { current, available } = account.balances;
      if (finite(current)) totals[bucket] += current;
      // Plaid guarantees `available` when `current` is null; for a deposit account it's current less pending.
      else if (bucket === "cash" && finite(available)) totals.cash += available;
      else if (bucket === "investments") unvalued.push(account.account_id);
      else ctx.log(`plaid: a ${account.type} account without a balance: left out`);
    }

    if (wantInvestments && unvalued.length > 0) {
      try {
        const held = await post<{ holdings?: Holding[] }>(ctx, app, "/investments/holdings/get", { access_token: accessToken }, 4_000_000);
        const wanted = new Set(unvalued);
        for (const h of held.holdings ?? []) {
          if (wanted.has(h.account_id) && finite(h.institution_value) && h.iso_currency_code?.toUpperCase() === currency) totals.investments += h.institution_value;
        }
      } catch (error) {
        const code = errorCode(error);
        if (code === "PRODUCTS_NOT_SUPPORTED" || code === "PRODUCT_NOT_ENABLED" || code === "NO_INVESTMENT_ACCOUNTS") {
          ctx.log(`plaid: ${unvalued.length} investment account(s) without a balance and no holdings (${code}): counted as 0`);
        } else {
          explainItem(error, institution);
        }
      }
    }

    const out: FetchResult = {};
    if (metrics.includes("cash")) out.cash = money(cents(totals.cash), currency);
    if (metrics.includes("investments")) out.investments = money(cents(totals.investments), currency);
    if (wantDebt) out["net-worth"] = money(cents(totals.cash + totals.investments - totals.debt), currency);
    return out;
  },

  sample: {
    cash: money(18_420, "usd"),
    investments: money(126_300, "usd"),
    "net-worth": money(131_900, "usd"),
  },
});

export default definePlugin({
  id: "plaid",
  name: "Plaid",
  description: "Verified cash, investments and net worth from US and Canadian banks, through Plaid.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [plaidConnector],
});
