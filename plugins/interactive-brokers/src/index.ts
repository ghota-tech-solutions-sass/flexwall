import { BlockedRequestError, ConnectorError, defineConnector, definePlugin, field, HttpError, money, series, type ConnectorContext, type FetchResult, type SeriesPoint } from "@flexwall/sdk";

/**
 * Interactive Brokers through the Flex Web Service, version 3. There is no
 * "read my balance" endpoint: the owner saves an Activity Flex Query in the
 * Client Portal, and the service runs it in two steps.
 *  1. SendRequest?t=<token>&q=<query id>&v=3 answers a reference code.
 *  2. GetStatement?t=<token>&q=<reference>&v=3 answers the statement, or
 *     error 1019 while IBKR is still generating it.
 * Both steps put the token in the URL (IBKR's design, no header alternative),
 * so URLs are never logged and errors thrown from here never carry them.
 *
 * NAV comes from the "Net Asset Value (NAV) in Base" section, which the XML
 * calls EquitySummaryInBase: one EquitySummaryByReportDateInBase row per day
 * when the query breaks out by day. Reports update once a day.
 */

const SERVICE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
// IBKR requires a User-Agent in "Technology/Version" form for programmatic access.
const USER_AGENT = "Flexwall/1.0";
/** The statement is usually ready a few seconds after SendRequest. Waits before each retry of GetStatement; tests set them to 0. */
export const timing = { retryDelaysMs: [2500, 5000] };

/** Errors that go away by themselves: let them through so tiles keep their last value. */
const TRANSIENT = new Set(["1001", "1004", "1005", "1006", "1007", "1008", "1009", "1017", "1018", "1019", "1021"]);
/** Errors the owner fixes in the Client Portal, in one sentence each. */
const OWNER_FIXABLE: Record<string, string> = {
  "1003": "IBKR has no statement for this Flex query's period yet. Check the query's period covers recent days.",
  "1010": "This is a legacy Flex query, which IBKR no longer runs. Create an Activity Flex Query instead.",
  "1011": "The Flex Web Service is turned off. Turn it on in Client Portal → Flex Queries → Flex Web Service Configuration.",
  "1012": "The Flex token has expired. Generate a new one with the longest expiry and connect again.",
  "1013": "The Flex token is restricted to another IP address. Generate a token with no IP address and connect again.",
  "1014": "IBKR doesn't recognise this Flex query id. Copy the Query ID of your Activity Flex Query again.",
  "1015": "IBKR refused the Flex token. It may have been replaced by a newer one: copy the current token and connect again.",
  "1016": "IBKR says the account in this Flex query is invalid. Check the query covers an open account.",
  "1020": "IBKR couldn't validate the request. Check the Flex token and query id, and connect again.",
};

export interface FlexReply {
  status: string;
  referenceCode?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NavRow {
  accountId: string;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  total: number;
}

export interface Statement {
  /** Whether the query includes the NAV in Base section at all, even empty. */
  hasNavSection: boolean;
  accounts: string[];
  /** The base currency from Account Information, when the query includes it. */
  currency: string | null;
  /** Oldest first, one row per day. */
  rows: NavRow[];
}

/** Thrown while IBKR is still busy; `connect` turns it into a sentence, `fetch` lets it through. */
class FlexBusyError extends Error {
  constructor(readonly code: string) {
    super(`The IBKR Flex Web Service is busy (error ${code}).`);
    this.name = "FlexBusyError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Attributes of an XML start tag's inner text (`a="1" b='2'`), entities decoded. */
export function parseAttributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = decode(m[2] ?? m[3] ?? "");
  return out;
}

/** Every element called `tag`, as its attributes. Flex statements carry their data in attributes, not text. */
export function elements(xml: string, tag: string): Record<string, string>[] {
  const pattern = new RegExp(`<${tag}(?=[\\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>`, "g");
  return [...xml.matchAll(pattern)].map((m) => parseAttributes(m[1].replace(/\/\s*$/, "")));
}

/** Text of the first `<tag>…</tag>`, trimmed and decoded, or undefined. */
function childText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return m ? decode(m[1]).trim() : undefined;
}

/** The small FlexStatementResponse both steps answer with (a reference code, or an error). Null for anything else, such as a statement. */
export function parseFlexReply(xml: string): FlexReply | null {
  if (!/<FlexStatementResponse[\s>]/.test(xml)) return null;
  return {
    status: childText(xml, "Status") ?? "",
    referenceCode: childText(xml, "ReferenceCode"),
    errorCode: childText(xml, "ErrorCode"),
    errorMessage: childText(xml, "ErrorMessage"),
  };
}

/** A Flex date as YYYY-MM-DD. Only the unambiguous formats: yyyyMMdd and yyyy-MM-dd. */
export function flexDate(raw: string | undefined): string | null {
  const m = (raw ?? "").trim().match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[;,\sT].*)?$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31 ? `${y}-${mo}-${d}` : null;
}

export function parseStatement(xml: string): Statement {
  if (!/<FlexQueryResponse[\s>]/.test(xml)) throw new Error("The IBKR Flex Web Service answered something that isn't a Flex statement.");
  const info = elements(xml, "AccountInformation");
  const accounts = new Set<string>();
  for (const s of elements(xml, "FlexStatement")) if (s.accountId) accounts.add(s.accountId);
  for (const a of info) if (a.accountId) accounts.add(a.accountId);

  const byDate = new Map<string, NavRow>();
  let undated = 0;
  for (const row of elements(xml, "EquitySummaryByReportDateInBase")) {
    const total = row.total === undefined || row.total.trim() === "" ? NaN : Number(row.total.replace(/,/g, ""));
    if (!Number.isFinite(total)) continue;
    const date = flexDate(row.reportDate);
    if (!date) {
      undated++;
      continue;
    }
    if (row.accountId) accounts.add(row.accountId);
    byDate.set(date, { accountId: row.accountId ?? "", currency: (row.currency ?? "").toLowerCase(), date, total });
  }
  if (undated > 0 && byDate.size === 0) {
    throw new ConnectorError("The Flex query's dates can't be read. Set its Date Format to yyyyMMdd or yyyy-MM-dd.");
  }
  const currency = info.map((a) => a.currency ?? a.currencyPrimary).find((c) => c && /^[A-Za-z]{3}$/.test(c));
  return {
    hasNavSection: /<EquitySummaryInBase[\s/>]/.test(xml) || byDate.size > 0,
    accounts: [...accounts],
    currency: currency ? currency.toLowerCase() : null,
    rows: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  };
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** One Flex call. Failures are rethrown without the URL, which holds the token. */
async function call(ctx: ConnectorContext, step: "SendRequest" | "GetStatement", token: string, q: string): Promise<string> {
  const url = `${SERVICE}/${step}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}&v=3`;
  try {
    return await ctx.fetch.text(url, { headers: { "User-Agent": USER_AGENT }, maxBytes: 4_000_000, timeoutMs: 15_000 });
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(error.status, `${SERVICE}/${step}`, "");
    if (error instanceof BlockedRequestError && error.reason === "too-large") {
      throw new ConnectorError("The Flex statement is too large. Keep only the Account Information and Net Asset Value (NAV) in Base sections in the query.");
    }
    throw error;
  }
}

function failWith(reply: FlexReply): never {
  const code = reply.errorCode ?? "";
  if (OWNER_FIXABLE[code]) throw new ConnectorError(OWNER_FIXABLE[code]);
  if (TRANSIENT.has(code)) throw new FlexBusyError(code);
  throw new Error(`The IBKR Flex Web Service failed with error ${code || "unknown"}.`);
}

/** Runs the query: SendRequest, then GetStatement until the statement is ready or the retries run out. */
export async function readStatement(token: string, queryId: string, ctx: ConnectorContext): Promise<Statement> {
  const sent = parseFlexReply(await call(ctx, "SendRequest", token, queryId));
  if (!sent) throw new Error("The IBKR Flex Web Service answered SendRequest with something unexpected.");
  if (sent.status !== "Success" || !sent.referenceCode) failWith(sent);
  // The reply also names a GetStatement URL; the documented one is used instead, so an answer can't point requests elsewhere.
  for (let attempt = 0; ; attempt++) {
    const body = await call(ctx, "GetStatement", token, sent.referenceCode);
    const reply = parseFlexReply(body);
    if (!reply) return parseStatement(body);
    if (reply.errorCode === "1019" && attempt < timing.retryDelaysMs.length) {
      await wait(timing.retryDelaysMs[attempt]);
      continue;
    }
    failWith(reply);
  }
}

/** Checks the statement answers NAV for exactly one live account, and returns that account. */
function checkStatement(statement: Statement): string {
  if (!statement.hasNavSection) {
    throw new ConnectorError("The Flex query has no Net Asset Value (NAV) in Base section. Add it, with every field, and connect again.");
  }
  if (statement.accounts.length > 1) throw new ConnectorError("The Flex query covers several accounts. Select a single account in the query.");
  const account = statement.accounts[0] ?? "";
  // IBKR paper trading accounts are numbered DU…: simulated money has no place on a wealth board.
  if (/^DU/i.test(account)) throw new ConnectorError("This Flex query reads a paper trading account. Flexwall only shows live accounts.");
  return account;
}

export function toValues(statement: Statement): FetchResult {
  checkStatement(statement);
  const last = statement.rows[statement.rows.length - 1];
  const currency = last?.currency || statement.currency;
  if (!last) return { nav: null, "nav-history": series([], { unit: "currency", currency: statement.currency ?? undefined }) };
  if (!currency) throw new ConnectorError("The Flex statement doesn't say its currency. Include the Currency field in the Net Asset Value (NAV) in Base section.");
  const points: SeriesPoint[] = statement.rows.map((r) => ({ t: r.date, v: Math.round(r.total * 100) / 100 }));
  return {
    nav: money(Math.round(last.total * 100) / 100, currency),
    "nav-history": series(points, { unit: "currency", currency }),
  };
}

const interactiveBrokersConnector = defineConnector({
  id: "interactive-brokers",
  name: "Interactive Brokers",
  description: "Verified net asset value of an IBKR account, from a Flex query.",
  homepage: "https://www.interactivebrokers.com",
  tier: "pro",
  verified: true,
  // Flex statements are end-of-day reports, and the service allows 10 requests a minute per token.
  ttl: 6 * 3600,
  auth: {
    label: "Connect Interactive Brokers",
    help: "In the IBKR Client Portal, open Performance & Reports → Flex Queries and create an Activity Flex Query: sections Account Information and Net Asset Value (NAV) in Base (select all fields in both), one account, Format XML, Period Last 30 Calendar Days, Breakout by Day Yes, Date Format yyyyMMdd or yyyy-MM-dd. Save it and copy its Query ID. Then open Flex Web Service Configuration, turn the service on, and generate a token with the longest expiry and no IP address. A Flex token only reads reports: it can't trade or move money.",
    fields: [
      field.secret("token", "Flex token", { maxLength: 100, pattern: "^[A-Za-z0-9]{10,100}$", patternMessage: "can only contain letters and digits" }),
      field.text("queryId", "Flex Query ID", { placeholder: "1234567", maxLength: 20, pattern: "^\\d{3,20}$", patternMessage: "must be the numeric Query ID" }),
    ],
  },
  metrics: [
    { id: "nav", name: "Net asset value", description: "Total NAV in the account's base currency at the last report date.", type: "number", unit: "currency", defaults: { label: "net worth at IBKR" }, leaderboard: "wealth", sensitive: true },
    { id: "nav-history", name: "Net asset value, by day", description: "Daily NAV over the Flex query's period.", type: "series", unit: "currency", defaults: { label: "NAV" }, sensitive: true },
  ],

  // One statement answers both metrics.
  cacheKey: () => "statement",

  async fetch({ secret, public: settings }, ctx) {
    const token = secret?.token;
    const queryId = settings?.queryId;
    if (!token || !queryId) return {};
    return toValues(await readStatement(token, queryId, ctx));
  },

  async connect(input, ctx) {
    const token = String(input.token ?? "").trim();
    const queryId = String(input.queryId ?? "").trim();
    try {
      const statement = await readStatement(token, queryId, ctx);
      // Building the values runs every check fetch would (NAV section, one live account, a currency), so a bad query fails now.
      const values = toValues(statement);
      const account = statement.accounts[0];
      const currency = (values.nav?.type === "number" && values.nav.currency) || statement.currency;
      return {
        secret: { token },
        public: { hint: `…${token.slice(-4)}`, queryId, ...(account ? { account: `…${account.slice(-4)}` } : {}), ...(currency ? { currency } : {}) },
        label: account ? `Interactive Brokers (…${account.slice(-4)})` : `Interactive Brokers (query ${queryId})`,
        ...(account ? { accountId: account } : {}),
      };
    } catch (error) {
      // Connecting is a moment the owner is waiting: a busy service gets a sentence rather than a failure.
      if (error instanceof FlexBusyError) throw new ConnectorError("IBKR is still preparing the statement or is busy. Try connecting again in a minute.");
      throw error;
    }
  },

  sample: {
    nav: money(412_380, "usd"),
    "nav-history": series(
      Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (30 - i) * 86_400_000).toISOString().slice(0, 10), v: Math.round(395_000 + i * 540 + 4_200 * Math.sin(i / 3)) })),
      { unit: "currency", currency: "usd" }
    ),
  },
});

export default definePlugin({
  id: "interactive-brokers",
  name: "Interactive Brokers",
  description: "Verified net asset value from an IBKR Flex query.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [interactiveBrokersConnector],
});

export { interactiveBrokersConnector };
