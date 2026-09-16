import { ConnectorError, defineConnector, definePlugin, HttpError, money, number, type ConnectorContext, type FetchResult, type ServerStatus } from "@flexwall/sdk";

/**
 * French (and Spanish) bank accounts, savings, PEA, brokerage, life insurance
 * and retirement plans through Powens (formerly Budget Insight).
 *
 * The Flexwall server owns one Powens domain and client application
 * (POWENS_DOMAIN, POWENS_CLIENT_ID, POWENS_CLIENT_SECRET). Each Flexwall
 * connection is one Powens user, holding a permanent user token.
 *
 *  - `authorize`: `POST /auth/init` with the client credentials creates the
 *    user and its permanent `auth_token`; `GET /auth/token/code?type=singleAccess`
 *    trades it for a one-time code; the owner goes to the Connect webview
 *    with that code. The token only travels in `carry` (sealed cookie).
 *  - `complete`: the webview comes back with `connection_id` (or `error`);
 *    `GET /users/me/connections?expand=connector` and `GET /users/me/accounts`
 *    build the label.
 *  - `fetch`: the same two requests. Powens syncs banks itself (every 24 h by
 *    default), so reading is cheap and never triggers a bank call.
 *
 * The token is permanent: no `expiresAt`, no `refresh`.
 */

export const WEBVIEW = "https://webview.powens.com";
/** The webview language. */
export const WEBVIEW_LANG = "fr";
/**
 * Connectors offered in the webview. Powens treats several values as AND
 * (only connectors exposing all of them), not OR, so exactly one is sent:
 * `bankwealth`, the wealth connectors (PEA, market, life insurance…), which is
 * what this plugin is for. Omitting it would mean `bank`: current and savings
 * accounts only.
 */
export const CONNECTOR_CAPABILITIES = "bankwealth";
/** A value in euros; other currencies are left out, never converted. */
export const CURRENCY = "EUR";

/** Checking and savings, livrets included. From Powens' AccountTypeName values. */
export const CASH_TYPES: ReadonlySet<string> = new Set(["checking", "savings", "deposit", "joint", "livret_a", "livret_b", "ldds", "cel", "pel", "csl", "cat"]);
/**
 * Investment envelopes. `crypto` isn't in Powens' documented list: kept in
 * case a connector sends it, harmless otherwise.
 */
export const INVESTMENT_TYPES: ReadonlySet<string> = new Set([
  "market",
  "pea",
  "lifeinsurance",
  "capitalisation",
  "per",
  "perp",
  "perco",
  "madelin",
  "article83",
  "pee",
  "rsp",
  "crowdlending",
  "real_estate",
  "crypto",
]);
/**
 * Debt. Powens doesn't document the sign of these balances, so the amount owed
 * is `Math.abs(balance)` whatever the sign.
 */
export const DEBT_TYPES: ReadonlySet<string> = new Set(["loan", "consumercredit", "revolvingcredit", "card"]);

/** Connection states only the owner can clear, in the webview or at their bank. */
const OWNER_STATES: Record<string, string> = {
  SCARequired: "your bank wants you to confirm your identity again",
  webauthRequired: "your bank wants you to sign in again",
  additionalInformationNeeded: "your bank asks for more information, like a code",
  decoupled: "your bank wants you to confirm in its app",
  wrongpass: "your bank refused the saved password",
  passwordExpired: "your password expired at your bank; change it there first",
  actionNeeded: "your bank wants you to do something on its website or app",
};
/** States Powens resolves on its own; the last synced data stays readable. */
const TRANSIENT_STATES = new Set(["validating", "rateLimiting", "websiteUnavailable", "bug"]);

export interface PowensAccount {
  id: number;
  id_connection?: number | null;
  balance?: number | null;
  /** Documented as an AccountType object; examples show the bare name. */
  type?: string | { name?: string } | null;
  /** Documented as a Currency object; tolerated as a bare code. */
  currency?: string | { id?: string } | null;
  disabled?: string | null;
  deleted?: string | null;
  display?: boolean;
}
export interface PowensConnection {
  id: number;
  id_user?: number | null;
  state?: string | null;
  error_message?: string | null;
  connector?: { name?: string } | null;
}

const NO_APP = "This Flexwall server has no Powens app.";

interface App {
  api: string;
  /** The webview's `domain` parameter: `name.biapi.pro`. */
  host: string;
  clientId: string;
  clientSecret: string;
}

/** POWENS_DOMAIN as a name (`flexwall-sandbox`) or a host (`flexwall-sandbox.biapi.pro`, with or without scheme). */
export function powensHost(domain: string): string | null {
  const name = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.biapi\.pro$/, "");
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) ? `${name}.biapi.pro` : null;
}

/**
 * What the domain and POWENS_ENV say this server points at. A `-sandbox`
 * domain is a Powens sandbox whatever POWENS_ENV says: the domain is the
 * truth. Otherwise only `production` is production, so an unset or misspelled
 * POWENS_ENV reads as sandbox rather than guessing.
 */
function environment(ctx: ConnectorContext): ServerStatus["environment"] {
  const domain = ctx.env("POWENS_DOMAIN")?.trim().toLowerCase() ?? "";
  if (domain.includes("-sandbox")) return "sandbox";
  return ctx.env("POWENS_ENV")?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

function app(ctx: ConnectorContext): App {
  const domain = ctx.env("POWENS_DOMAIN");
  const clientId = ctx.env("POWENS_CLIENT_ID")?.trim();
  const clientSecret = ctx.env("POWENS_CLIENT_SECRET")?.trim();
  if (!domain?.trim() || !clientId || !clientSecret) throw new ConnectorError(NO_APP);
  const host = powensHost(domain);
  if (!host) throw new ConnectorError("This Flexwall server's POWENS_DOMAIN isn't a Powens domain.");
  return { api: `https://${host}/2.0`, host, clientId, clientSecret };
}

const typeName = (a: PowensAccount) => String((typeof a.type === "string" ? a.type : a.type?.name) ?? "").toLowerCase();
const currencyCode = (a: PowensAccount) => String((typeof a.currency === "string" ? a.currency : a.currency?.id) ?? "").toUpperCase();

/** Enabled, still at the bank, and not hidden from aggregated totals. */
export function isActive(a: PowensAccount): boolean {
  return !a.disabled && !a.deleted && a.display !== false;
}

export interface Totals {
  cash: number;
  investments: number;
  debt: number;
  netWorth: number;
  accounts: number;
  otherCurrency: number;
  unknownType: number;
}

/**
 * Active accounts in euros, by category. Net worth is cash plus investments
 * minus what is owed on loans and cards. Accounts in another currency (or
 * none) and of unknown types are counted apart and left out of the sums.
 */
export function totals(accounts: readonly PowensAccount[]): Totals {
  const round = (n: number) => Math.round(n * 100) / 100;
  let cash = 0;
  let investments = 0;
  let debt = 0;
  let otherCurrency = 0;
  let unknownType = 0;
  const active = accounts.filter(isActive);
  for (const a of active) {
    const balance = typeof a.balance === "number" && Number.isFinite(a.balance) ? a.balance : null;
    if (balance === null) continue;
    if (currencyCode(a) !== CURRENCY) {
      otherCurrency++;
      continue;
    }
    const type = typeName(a);
    if (CASH_TYPES.has(type)) cash += balance;
    else if (INVESTMENT_TYPES.has(type)) investments += balance;
    else if (DEBT_TYPES.has(type)) debt += Math.abs(balance);
    else unknownType++;
  }
  return { cash: round(cash), investments: round(investments), debt: round(debt), netWorth: round(cash + investments - debt), accounts: active.length, otherCurrency, unknownType };
}

const bankName = (c: PowensConnection) => c.connector?.name?.trim() || "your bank";

/** A sentence for a connection that needs its owner, or null. Unknown states are logged and ignored. */
export function stateProblem(connection: PowensConnection, ctx: ConnectorContext): ConnectorError | null {
  const state = connection.state;
  if (!state) return null;
  const why = OWNER_STATES[state];
  if (why) return new ConnectorError(`Reconnect ${bankName(connection)} in Powens: ${why}.`);
  ctx.log(TRANSIENT_STATES.has(state) ? `powens connection in state ${state}: showing the last synced data` : `powens connection in unknown state ${state}: showing the last synced data`);
  return null;
}

/** The user token was revoked or the user deleted. Rate limits and outages pass through. */
function explainUser(error: unknown): never {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw new ConnectorError("Reconnect Powens: it no longer accepts this connection.");
  throw error;
}

/** A token minted seconds ago was refused: reconnecting would loop, so say what happened. */
function explainFreshToken(error: unknown): never {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw new ConnectorError("Powens refused the connection it just made. Try again later.");
  throw error;
}

/** The server's client application was refused. */
function explainApp(error: unknown): never {
  if (error instanceof HttpError && (error.status === 400 || error.status === 401 || error.status === 403)) throw new ConnectorError("Powens refused this Flexwall server's client application.");
  throw error;
}

async function readUser(ctx: ConnectorContext, api: string, token: string, explain: (error: unknown) => never = explainUser): Promise<{ connections: PowensConnection[]; accounts: PowensAccount[] }> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  try {
    const [c, a] = await Promise.all([
      ctx.fetch.json<{ connections?: PowensConnection[] }>(`${api}/users/me/connections?expand=connector`, { headers }),
      ctx.fetch.json<{ accounts?: PowensAccount[] }>(`${api}/users/me/accounts`, { headers }),
    ]);
    return { connections: c.connections ?? [], accounts: a.accounts ?? [] };
  } catch (error) {
    explain(error);
  }
}

/**
 * `DELETE /users/me` with the user's own token (204): deletes the user and its
 * bank connections. Only POWENS_DOMAIN is needed; without it or a token there
 * is nothing to do. A token Powens refuses (401, 403) or a 404 means the user
 * is gone already.
 */
async function deleteUser(ctx: ConnectorContext, token: string | undefined): Promise<void> {
  const domain = ctx.env("POWENS_DOMAIN")?.trim();
  if (!domain || !token) return;
  const host = powensHost(domain);
  if (!host) throw new ConnectorError("This Flexwall server's POWENS_DOMAIN isn't a Powens domain.");
  try {
    await ctx.fetch.text(`https://${host}/2.0/users/me`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  } catch (error) {
    if (error instanceof HttpError && [401, 403, 404].includes(error.status)) return;
    throw error;
  }
}

/**
 * `authorize` made a permanent Powens user; a sign-in that connected nothing
 * deletes it before telling the owner why. Best effort: a failure is logged,
 * without the token, and the owner's sentence doesn't change.
 */
async function forgetUser(ctx: ConnectorContext, token: string | undefined): Promise<void> {
  try {
    await deleteUser(ctx, token);
  } catch (error) {
    ctx.log(`powens user of an unfinished sign-in not deleted: ${error instanceof HttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "unknown error"}`);
  }
}

export const powensConnector = defineConnector({
  id: "powens",
  name: "Powens",
  description: "Verified net worth, cash and investments across French bank accounts, PEA, brokerage and life insurance, through Powens.",
  homepage: "https://www.powens.com",
  tier: "pro",
  // Every connection here is a paying link at the provider, billed monthly: the owner pays for it by the account.
  serverCost: "per-account",
  verified: true,
  // Powens syncs each connection in the background every 24 hours by default.
  ttl: 6 * 3600,
  auth: {
    label: "Connect a French bank",
    help: "You'll pick your bank, brokerage or insurer in Powens' secure window, sign in there and choose which accounts to share. Flexwall reads balances only, never transactions, and can't move money. Powens keeps the connection and refreshes it about once a day.",
    fields: [],
    oauth: {
      async authorize({ redirectUri, state }, ctx) {
        const { api, host, clientId, clientSecret } = app(ctx);
        let init: { auth_token?: string; id_user?: number };
        try {
          init = await ctx.fetch.json(`${api}/auth/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
          });
        } catch (error) {
          explainApp(error);
        }
        const token = init.auth_token;
        if (!token) throw new Error("Powens answered /auth/init without a token");
        const temp = await ctx.fetch.json<{ code?: string }>(`${api}/auth/token/code?type=singleAccess`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
        if (!temp.code) throw new Error("Powens answered /auth/token/code without a code");
        const query = new URLSearchParams({ domain: host, client_id: clientId, redirect_uri: redirectUri, code: temp.code, state, connector_capabilities: CONNECTOR_CAPABILITIES });
        return {
          url: `${WEBVIEW}/${WEBVIEW_LANG}/connect?${query}`,
          carry: { token, ...(typeof init.id_user === "number" ? { user: String(init.id_user) } : {}) },
        };
      },

      async complete({ query, carry }, ctx) {
        if (query.error) {
          await forgetUser(ctx, carry.token);
          if (query.error === "access_denied") throw new ConnectorError("You cancelled in Powens, so nothing was connected.");
          if (query.error === "tos_declined") throw new ConnectorError("You declined Powens' terms, so nothing was connected.");
          const description = (query.error_description ?? "").trim().slice(0, 200);
          throw new ConnectorError(description ? `Powens didn't connect your bank: ${description}` : "Powens didn't connect your bank. Try again.");
        }
        if (!query.connection_id) {
          await forgetUser(ctx, carry.token);
          throw new ConnectorError("Powens didn't finish connecting your bank. Try again.");
        }
        const { api } = app(ctx);
        if (!carry.token) throw new ConnectorError("That Powens sign-in expired. Connect again.");
        const { connections, accounts } = await readUser(ctx, api, carry.token, explainFreshToken);
        const connection = connections.find((c) => String(c.id) === query.connection_id);
        if (!connection) {
          await forgetUser(ctx, carry.token);
          throw new ConnectorError("Powens didn't finish connecting your bank. Try again.");
        }
        const active = accounts.filter(isActive);
        if (active.length === 0) {
          await forgetUser(ctx, carry.token);
          throw new ConnectorError("You shared no account in Powens. Connect again and pick at least one account.");
        }
        const banks = [...new Set(connections.map((c) => c.connector?.name?.trim()).filter((n): n is string => Boolean(n)))];
        const bankList = banks.join(", ") || "Powens";
        const n = active.length;
        return {
          secret: { token: carry.token },
          public: { banks: bankList, accounts: String(n) },
          label: `${bankList} (${n} account${n === 1 ? "" : "s"})`,
          accountId: carry.user || (connection.id_user ? String(connection.id_user) : String(connection.id)),
        };
      },
    },

    /**
     * Deletes the Powens user, which ends its bill and its bank connections:
     * `DELETE /users/me` with its own token, answered 204. Only the domain is
     * needed. A token Powens refuses (401, 403) or a 404 means the user is
     * already gone.
     */
    async disconnect({ secret }, ctx) {
      await deleteUser(ctx, secret.token);
    },
  },

  server(ctx) {
    const domain = ctx.env("POWENS_DOMAIN")?.trim();
    const host = domain ? powensHost(domain) : null;
    const configured = Boolean(host && ctx.env("POWENS_CLIENT_ID")?.trim() && ctx.env("POWENS_CLIENT_SECRET")?.trim());
    return { configured, environment: environment(ctx), detail: host ?? "POWENS_DOMAIN unset or not a Powens domain" };
  },

  metrics: [
    {
      id: "net-worth",
      name: "Net worth",
      description: "Cash plus investments minus what's owed on loans and cards, in euros.",
      type: "number",
      unit: "currency",
      defaults: { label: "net worth" },
      leaderboard: "wealth",
      sensitive: true,
    },
    { id: "cash", name: "Cash", description: "Current and savings accounts, livrets included, in euros.", type: "number", unit: "currency", defaults: { label: "in the bank" }, sensitive: true },
    {
      id: "investments",
      name: "Investments",
      description: "Brokerage, PEA, life insurance and retirement plans, in euros.",
      type: "number",
      unit: "currency",
      defaults: { label: "invested" },
      sensitive: true,
    },
    { id: "accounts", name: "Accounts", description: "Accounts shared with Powens and still active.", type: "number", unit: "count", defaults: { label: "accounts" } },
  ],

  // The same two requests answer every metric.
  cacheKey: () => "user",

  async fetch({ secret }, ctx) {
    const { api } = app(ctx);
    if (!secret?.token) throw new ConnectorError("Reconnect Powens: this connection has no token.");
    const { connections, accounts } = await readUser(ctx, api, secret.token);
    if (connections.length === 0) throw new ConnectorError("Reconnect Powens: your bank connection was removed there.");
    for (const connection of connections) {
      const problem = stateProblem(connection, ctx);
      if (problem) throw problem;
    }
    const t = totals(accounts);
    if (t.otherCurrency > 0) ctx.log(`${t.otherCurrency} powens account(s) not in ${CURRENCY}: left out`);
    if (t.unknownType > 0) ctx.log(`${t.unknownType} powens account(s) of an unknown type: left out`);
    const out: FetchResult = {
      "net-worth": money(t.netWorth, CURRENCY),
      cash: money(t.cash, CURRENCY),
      investments: money(t.investments, CURRENCY),
      accounts: number(t.accounts, { unit: "count" }),
    };
    return out;
  },

  sample: {
    "net-worth": money(186_400, "eur"),
    cash: money(24_800, "eur"),
    investments: money(171_600, "eur"),
    accounts: number(6, { unit: "count" }),
  },
});

export default definePlugin({
  id: "powens",
  name: "Powens",
  description: "Verified French bank, PEA, brokerage and life insurance balances, through Powens.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [powensConnector],
});
