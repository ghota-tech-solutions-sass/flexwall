import { BlockedRequestError, ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Bank account balances through Enable Banking, a PSD2 account information
 * service covering 30 European countries.
 *
 * The Flexwall server owns one Enable Banking application: its id
 * (ENABLE_BANKING_APP_ID) and RSA private key (ENABLE_BANKING_PRIVATE_KEY).
 * Every API call carries a JWT signed with that key (RS256, see
 * `enableBankingJwt`). The owner picks a country and a bank, is sent to
 * Enable Banking and their bank to consent, and comes back with a code that
 * becomes a session: its account uids are what `fetch` reads.
 *
 *  - `authorize`: `GET /aspsps` resolves the typed bank name and its longest
 *    consent, then `POST /auth` gives the address to send the owner to.
 *  - `complete`: `POST /sessions` trades the code for the session and accounts.
 *  - `fetch`: `GET /accounts/{uid}/balances` per account, no PSU headers
 *    (a background fetch), one balance per account by `BALANCE_PREFERENCE`.
 *
 * A consent can't be renewed without the owner, so there is no `refresh`:
 * `expiresAt` is the consent's end and the host asks the owner to reconnect.
 * Signing uses WebCrypto only: plugins are also bundled for the browser.
 */

export const API = "https://api.enablebanking.com";
/** Balances read per refresh at most. */
export const MAX_ACCOUNTS = 10;
/** Enable Banking accepts JWTs living up to 86,400 s; one per pass, short-lived. */
export const JWT_SECONDS = 3600;
/** Used when the bank list can't be read: the longest consent most banks allow. */
export const DEFAULT_CONSENT_SECONDS = 180 * 86400;
/** Asking for exactly the bank's maximum risks a refusal a few seconds later. */
const CONSENT_MARGIN_SECONDS = 600;

/**
 * Which balance counts, first match wins. Enable Banking publishes no
 * recommendation, so this is a choice: booked balances first, because
 * "available" balances can include an overdraft or credit line, which isn't
 * money the owner has. Intraday before closing, so the number is the freshest
 * the bank gives. Expected (instant, with pending payments) next, then the
 * available kinds, then whatever is left.
 */
export const BALANCE_PREFERENCE = ["ITBD", "CLBD", "XPCD", "ITAV", "CLAV", "OPBD", "PRCD", "OPAV", "VALU", "FWAV", "INFO", "OTHR"] as const;

/** Card and loan accounts report debt or available credit, not savings: they aren't summed. */
const NOT_SUMMED = new Set(["CARD", "LOAN"]);

/** Countries from Enable Banking's market pages (docs/markets), as ISO 3166 alpha-2. */
export const COUNTRIES: { value: string; label: string }[] = [
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "BG", label: "Bulgaria" },
  { value: "HR", label: "Croatia" },
  { value: "CY", label: "Cyprus" },
  { value: "CZ", label: "Czechia" },
  { value: "DK", label: "Denmark" },
  { value: "EE", label: "Estonia" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "GR", label: "Greece" },
  { value: "HU", label: "Hungary" },
  { value: "IS", label: "Iceland" },
  { value: "IE", label: "Ireland" },
  { value: "IT", label: "Italy" },
  { value: "LV", label: "Latvia" },
  { value: "LI", label: "Liechtenstein" },
  { value: "LT", label: "Lithuania" },
  { value: "LU", label: "Luxembourg" },
  { value: "MT", label: "Malta" },
  { value: "NL", label: "Netherlands" },
  { value: "NO", label: "Norway" },
  { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" },
  { value: "RO", label: "Romania" },
  { value: "SK", label: "Slovakia" },
  { value: "SI", label: "Slovenia" },
  { value: "ES", label: "Spain" },
  { value: "SE", label: "Sweden" },
];

export interface Amount {
  currency: string;
  amount: string;
}
export interface Balance {
  name?: string;
  balance_amount: Amount;
  balance_type: string;
  last_change_date_time?: string;
  reference_date?: string;
}
export interface Account {
  uid?: string;
  cash_account_type?: string;
  currency?: string;
  identification_hash?: string;
}
export interface Aspsp {
  name: string;
  country: string;
  maximum_consent_validity?: number;
}
export interface Session {
  session_id: string;
  accounts: Account[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
}

const NO_APPLICATION = "This Flexwall server has no Enable Banking application.";
const CONSENT_ENDED = "Reconnect your bank: its consent ended.";
/** Error codes that mean the session can't be used any more. */
const SESSION_GONE = new Set(["EXPIRED_SESSION", "REVOKED_SESSION", "CLOSED_SESSION", "SESSION_DOES_NOT_EXIST", "WRONG_SESSION_STATUS", "ACCOUNT_DOES_NOT_EXIST"]);

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The private key as PKCS#8 DER. Accepts the PEM with real newlines, with
 * `\n` escapes (environment files often hold one line), or flattened.
 * `openssl genrsa` from OpenSSL 1.x writes PKCS#1, which WebCrypto can't read:
 * that one is refused with the command that converts it.
 */
export function privateKeyDer(pem: string): Uint8Array<ArrayBuffer> {
  const text = pem.replace(/\\n/g, "\n").trim();
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text)) {
    throw new ConnectorError("This Flexwall server's Enable Banking key is PKCS#1: convert it with openssl pkcs8 -topk8 -nocrypt.");
  }
  const match = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(text);
  if (!match) throw new ConnectorError("This Flexwall server's Enable Banking key isn't a PEM private key.");
  try {
    const binary = atob(match[1].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new ConnectorError("This Flexwall server's Enable Banking key isn't a PEM private key.");
  }
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = privateKeyDer(pem);
  try {
    return await globalThis.crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch {
    throw new ConnectorError("This Flexwall server's Enable Banking key isn't an RSA private key.");
  }
}

/**
 * A JWT as Enable Banking documents it: header `typ` JWT, `alg` RS256, `kid`
 * the application id; claims `iss` "enablebanking.com", `aud`
 * "api.enablebanking.com" (the older "api.tilisy.com" is deprecated, don't
 * go back to it), `iat` and `exp`, at most 24 hours apart.
 */
export async function enableBankingJwt(input: { appId: string; key: CryptoKey; nowSeconds: number }): Promise<string> {
  const iat = Math.floor(input.nowSeconds);
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: input.appId }));
  const payload = base64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + JWT_SECONDS }));
  const signature = await globalThis.crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, input.key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

/** The `error` code of an ErrorResponse body, e.g. "EXPIRED_SESSION". Enable Banking asks clients to branch on it, not on statuses. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  try {
    const body = JSON.parse(error.body) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/** One balance for an account, by `BALANCE_PREFERENCE`; the latest when a type appears twice. */
export function pickBalance(balances: readonly Balance[]): Balance | null {
  const usable = balances.filter((b) => b.balance_amount && Number.isFinite(Number.parseFloat(b.balance_amount.amount)));
  for (const type of BALANCE_PREFERENCE) {
    const matches = usable.filter((b) => b.balance_type === type);
    if (matches.length === 0) continue;
    const when = (b: Balance) => b.last_change_date_time ?? b.reference_date ?? "";
    return matches.reduce((latest, b) => (when(b) > when(latest) ? b : latest));
  }
  return null;
}

/** Sums balances in the currency of the first one; the others are left out and counted. */
export function sumBalances(picked: readonly Amount[]): { total: number; currency: string; skipped: number } | null {
  if (picked.length === 0) return null;
  const currency = picked[0].currency.toUpperCase();
  let total = 0;
  let skipped = 0;
  for (const a of picked) {
    if (a.currency.toUpperCase() !== currency) skipped++;
    else total += Number.parseFloat(a.amount);
  }
  return { total: Math.round(total * 100) / 100, currency, skipped };
}

const normalizeName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const countryName = (code: string) => COUNTRIES.find((c) => c.value === code)?.label ?? code;

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function unknownBank(typed: string, country: string): ConnectorError {
  return new ConnectorError(`Enable Banking lists no bank called ${typed} in ${countryName(country)} for personal accounts. Copy the name from Enable Banking's bank list.`);
}

/** Errors about the server's application rather than the owner's bank. Rate limits and outages pass through. */
function explainApplication(error: unknown): never {
  const code = errorCode(error);
  if (code === "UNAUTHORIZED_ACCESS" || code === "ACCESS_DENIED") throw new ConnectorError("Enable Banking refused this Flexwall server's application.");
  if (code === "REDIRECT_URI_NOT_ALLOWED") throw new ConnectorError("This Flexwall server's Enable Banking application doesn't allow its callback address.");
  throw error;
}

export function makeEnableBankingConnector(clock: { now?: () => number } = {}): ConnectorDef {
  const now = clock.now ?? Date.now;

  /** The server's application and a JWT for this pass, or a sentence before any request. */
  async function authorization(ctx: ConnectorContext): Promise<Record<string, string>> {
    const appId = ctx.env("ENABLE_BANKING_APP_ID")?.trim();
    const privateKey = ctx.env("ENABLE_BANKING_PRIVATE_KEY");
    if (!appId || !privateKey) throw new ConnectorError(NO_APPLICATION);
    const key = await importPrivateKey(privateKey);
    const jwt = await enableBankingJwt({ appId, key, nowSeconds: now() / 1000 });
    return { Authorization: `Bearer ${jwt}`, Accept: "application/json" };
  }

  /** The bank as Enable Banking names it, matched without case, and its longest consent. */
  async function findBank(ctx: ConnectorContext, headers: Record<string, string>, country: string, typed: string): Promise<Aspsp> {
    let list: { aspsps?: Aspsp[] };
    try {
      // Germany lists well over a thousand banks: allow the host maximum.
      list = await ctx.fetch.json(`${API}/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`, { headers, maxBytes: 4_000_000, timeoutMs: 15_000 });
    } catch (error) {
      if (error instanceof BlockedRequestError && error.reason === "too-large") {
        // Without the list, try the name as typed: POST /auth still refuses unknown banks.
        ctx.log("enable banking bank list too large: using the typed name and a 180-day consent");
        return { name: typed, country };
      }
      explainApplication(error);
    }
    const wanted = normalizeName(typed);
    const bank = (list.aspsps ?? []).find((a) => normalizeName(a.name) === wanted);
    if (!bank) throw unknownBank(typed, country);
    return bank;
  }

  async function readBalances(ctx: ConnectorContext, uids: readonly string[]): Promise<Amount[] | null> {
    const headers = await authorization(ctx);
    let unreadable = 0;
    const picks = await Promise.all(
      uids.map(async (uid) => {
        try {
          // No PSU headers: this is a background fetch, which banks allow about 4 times a day.
          const body = await ctx.fetch.json<{ balances?: Balance[] }>(`${API}/accounts/${encodeURIComponent(uid)}/balances`, { headers, timeoutMs: 15_000 });
          const pick = pickBalance(body.balances ?? []);
          if (!pick) ctx.log("enable banking account without a usable balance: skipped");
          return pick?.balance_amount ?? null;
        } catch (error) {
          const code = errorCode(error);
          if (code && SESSION_GONE.has(code)) throw new ConnectorError(CONSENT_ENDED);
          if (code === "ASPSP_PSU_ACTION_REQUIRED") throw new ConnectorError("Reconnect your bank: it wants you to confirm something before sharing again.");
          if (code === "ASPSP_ACCOUNT_NOT_ACCESSIBLE") {
            unreadable++;
            ctx.log("enable banking account no longer accessible: skipped");
            return null;
          }
          explainApplication(error);
        }
      })
    );
    if (unreadable === uids.length) throw new ConnectorError("Your bank no longer shares these accounts: reconnect your bank.");
    const found = picks.filter((p): p is Amount => p !== null);
    return found.length > 0 ? found : null;
  }

  return defineConnector({
    id: "enable-banking",
    name: "Bank accounts",
    description: "Verified balance of your bank accounts in Europe, read through open banking with Enable Banking.",
    homepage: "https://enablebanking.com",
    tier: "pro",
    // Every connection here is a paying link at the provider, billed monthly: the owner pays for it by the account.
    serverCost: "per-account",
    verified: true,
    // Banks allow about 4 unattended balance reads a day per account (PSD2), and
    // Enable Banking advises waiting 6 hours after a rate limit.
    ttl: 6 * 3600,
    auth: {
      label: "Connect your bank",
      help: "Pick your bank's country and type its name exactly as Enable Banking lists it (enablebanking.com/open-banking-apis, or the bank picker of any Enable Banking app). You'll sign in at your bank and choose which accounts to share. Flexwall only reads balances, never transactions, and can't move money. The consent lasts up to 180 days, depending on the bank; you'll be asked to reconnect after that.",
      fields: [
        field.select("country", "Country", COUNTRIES, { default: "FR" }),
        field.text("bank", "Bank", { placeholder: "BNP Paribas", maxLength: 120, help: "The name as Enable Banking lists it. Case doesn't matter." }),
      ],
      oauth: {
        async authorize({ fields, redirectUri, state }, ctx) {
          const country = String(fields.country);
          const typed = String(fields.bank).trim();
          const headers = await authorization(ctx);
          const bank = await findBank(ctx, headers, country, typed);
          const maxSeconds = bank.maximum_consent_validity ?? DEFAULT_CONSENT_SECONDS;
          const seconds = maxSeconds > CONSENT_MARGIN_SECONDS * 2 ? maxSeconds - CONSENT_MARGIN_SECONDS : maxSeconds;
          const body = {
            access: { valid_until: new Date(now() + seconds * 1000).toISOString() },
            aspsp: { name: bank.name, country },
            state,
            redirect_url: redirectUri,
            psu_type: "personal",
          };
          try {
            const started = await ctx.fetch.json<{ url?: string }>(`${API}/auth`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (!started.url?.startsWith("https://")) throw new Error("Enable Banking answered POST /auth without an address");
            return { url: started.url };
          } catch (error) {
            // The bank may have been renamed between the list and this call.
            if (errorCode(error) === "WRONG_ASPSP_PROVIDED") throw unknownBank(typed, country);
            explainApplication(error);
          }
        },

        async complete({ query }, ctx) {
          if (query.error) {
            throw new ConnectorError(query.error === "access_denied" ? "You didn't let Flexwall see your accounts, so nothing was connected." : "Your bank didn't finish the sign-in, so nothing was connected. Try again.");
          }
          if (!query.code) throw new ConnectorError("Your bank didn't finish the sign-in, so nothing was connected. Try again.");
          const headers = await authorization(ctx);
          let session: Session;
          try {
            session = await ctx.fetch.json<Session>(`${API}/sessions`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ code: query.code }), timeoutMs: 15_000 });
          } catch (error) {
            const code = errorCode(error);
            if (code === "WRONG_AUTHORIZATION_CODE" || code === "EXPIRED_AUTHORIZATION_CODE" || code === "ALREADY_AUTHORIZED") {
              throw new ConnectorError("That bank sign-in expired or was already used. Connect again.");
            }
            explainApplication(error);
          }
          const accounts = session.accounts ?? [];
          if (accounts.length === 0) throw new ConnectorError("Your bank shared no account with Flexwall. Connect again and pick at least one account.");
          const summed = accounts.filter((a) => a.uid && !NOT_SUMMED.has(String(a.cash_account_type ?? "").toUpperCase()));
          if (summed.length === 0) throw new ConnectorError("Your bank only shared card or loan accounts, which Flexwall doesn't count. Connect again and pick a current or savings account.");

          const bank = session.aspsp?.name ?? "Bank";
          const country = session.aspsp?.country ?? "";
          const expiresAt = Date.parse(session.access?.valid_until ?? "");
          const hashes = accounts.map((a) => a.identification_hash).filter((h): h is string => Boolean(h)).sort();
          const n = summed.length;
          return {
            secret: { session: session.session_id, accounts: summed.map((a) => a.uid).join(",") },
            public: { bank, country, accounts: String(n), ...(Number.isFinite(expiresAt) ? { consentUntil: new Date(expiresAt).toISOString().slice(0, 10) } : {}) },
            label: `${bank} (${n} account${n === 1 ? "" : "s"})`,
            // identification_hash is stable across sessions; session ids and uids change on every reconnect.
            ...(hashes.length > 0 ? { accountId: await sha256Hex(`${country}|${bank}|${hashes[0]}`) } : {}),
            ...(Number.isFinite(expiresAt) ? { expiresAt } : {}),
          };
        },
      },

      /**
       * Ends the session: `DELETE /sessions/{session_id}` with the app's JWT,
       * which also closes the bank consent where the bank allows it. A session
       * that expired, was closed or no longer exists is ended already.
       */
      async disconnect({ secret }, ctx) {
        if (!secret.session || !ctx.env("ENABLE_BANKING_APP_ID")?.trim() || !ctx.env("ENABLE_BANKING_PRIVATE_KEY")) return;
        const headers = await authorization(ctx);
        try {
          await ctx.fetch.text(`${API}/sessions/${encodeURIComponent(secret.session)}`, { method: "DELETE", headers });
        } catch (error) {
          const code = errorCode(error);
          if ((error instanceof HttpError && error.status === 404) || (code && SESSION_GONE.has(code))) return;
          explainApplication(error);
        }
      },
    },

    server(ctx) {
      return {
        configured: Boolean(ctx.env("ENABLE_BANKING_APP_ID")?.trim() && ctx.env("ENABLE_BANKING_PRIVATE_KEY")),
        // One address serves both: only ENABLE_BANKING_ENV says whether the application is a sandbox one.
        environment: ctx.env("ENABLE_BANKING_ENV")?.trim().toLowerCase() === "production" ? "production" : "sandbox",
        detail: new URL(API).host,
      };
    },

    metrics: [
      {
        id: "balance",
        name: "Balance",
        description: "The balance of the shared current and savings accounts, added up in the first account's currency.",
        type: "number",
        unit: "currency",
        defaults: { label: "in the bank" },
        leaderboard: "wealth",
        sensitive: true,
      },
      { id: "accounts", name: "Accounts", description: "Current and savings accounts shared with Flexwall.", type: "number", unit: "count", defaults: { label: "bank accounts" } },
    ],

    // The same consent answers both; `accounts` needs no request.
    cacheKey: () => "account",

    async fetch({ metrics, secret }, ctx) {
      const uids = (secret?.accounts ?? "").split(",").filter(Boolean);
      if (uids.length === 0) return {};
      const out: FetchResult = {};
      if (metrics.includes("accounts")) out.accounts = number(uids.length, { unit: "count" });
      if (metrics.includes("balance")) {
        if (uids.length > MAX_ACCOUNTS) ctx.log(`${uids.length} bank accounts: only the first ${MAX_ACCOUNTS} are summed`);
        const picked = await readBalances(ctx, uids.slice(0, MAX_ACCOUNTS));
        const sum = picked ? sumBalances(picked) : null;
        if (sum && sum.skipped > 0) ctx.log(`${sum.skipped} bank account(s) in another currency than ${sum.currency}: left out`);
        out.balance = sum ? money(sum.total, sum.currency) : null;
      }
      return out;
    },

    sample: {
      balance: money(48_250, "eur"),
      accounts: number(2, { unit: "count" }),
    },
  });
}

const enableBankingConnector = makeEnableBankingConnector();

export default definePlugin({
  id: "enable-banking",
  name: "Bank accounts",
  description: "Verified bank balances in Europe, through open banking.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [enableBankingConnector],
});

export { enableBankingConnector };
