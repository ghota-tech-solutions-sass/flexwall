import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type ConnectorContext, type ConnectorDef, type FetchResult } from "@flexwall/sdk";

/**
 * Public numbers of one X account, two ways:
 *
 * - `x`: with the owner's own X developer app. The owner pastes the Bearer
 *   Token of their app, X bills their developer account, and they pick how
 *   often it runs.
 * - `x-credits`: with Flexwall's X app (`X_BEARER_TOKEN`). The owner types a
 *   handle and pays in Flexwall credits, one a day per account the wall shows.
 *
 * One user lookup answers every metric either way.
 *
 * Verified against docs.x.com (September 2026): the OpenAPI spec, User lookup,
 * Rate limits, Response codes, and Pricing pages.
 */

const API = "https://api.x.com/2";

/** Price of one "User: Read" resource, in US dollars (docs.x.com/x-api/getting-started/pricing). */
export const PRICE_PER_USER_READ_USD = 0.01;
/** A month, for the estimates in the refresh labels. */
export const DAYS_PER_MONTH = 30;
/** How often an owner may refresh, in hours. */
export const REFRESH_HOURS = [1, 6, 24] as const;
export const DEFAULT_REFRESH_HOURS = 6;
/** Bounds of a connection's freshness: never faster than the connector's ttl, never slower than a day. */
export const MIN_TTL = 3600;
export const MAX_TTL = 24 * 3600;

/** Profile reads a month at one read per refresh. */
export function readsPerMonth(hours: number): number {
  return Math.round((DAYS_PER_MONTH * 24) / hours);
}

/** Upper bound in dollars, before X's daily deduplication. Rounded to cents. */
export function monthlyCostUsd(hours: number): number {
  return Math.round(readsPerMonth(hours) * PRICE_PER_USER_READ_USD * 100) / 100;
}

export function refreshLabel(hours: number): string {
  const every = hours === 1 ? "Every hour" : `Every ${hours} hours`;
  return `${every} · ~${readsPerMonth(hours)} reads/month · up to $${monthlyCostUsd(hours).toFixed(2)}`;
}

/** Seconds a connection's values stay fresh, from the refresh it chose. */
export function ttlForRefresh(refresh: string | undefined): number {
  const hours = Number(refresh);
  const seconds = Number.isFinite(hours) && hours > 0 ? hours * 3600 : DEFAULT_REFRESH_HOURS * 3600;
  return Math.min(MAX_TTL, Math.max(MIN_TTL, seconds));
}

/** The handle as the API and the connection store it: no @, lowercase (X handles are case-insensitive). */
export function normalizeHandle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

// X's OpenAPI spec for the username path parameter: ^[A-Za-z0-9_]{1,15}$. People copy handles with the @.
const HANDLE_PATTERN = "^@?[A-Za-z0-9_]{1,15}$";

// The slice of an X user object this connector reads. The spec names the post count
// `post_count`; the documented example response still says `tweet_count`. Both are read.
interface PublicMetrics {
  followers_count?: number;
  following_count?: number;
  post_count?: number;
  tweet_count?: number;
  listed_count?: number;
  like_count?: number | null;
}
interface XUser {
  id: string;
  username: string;
  public_metrics?: PublicMetrics;
}
interface XProblem {
  type?: string;
  title?: string;
  detail?: string;
  reason?: string;
}
interface UserResponse {
  data?: XUser;
  errors?: XProblem[];
}

const count = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? number(n, { unit: "count" }) : null);

function problemOf(body: string): XProblem {
  try {
    const parsed = JSON.parse(body) as XProblem & { errors?: XProblem[] };
    return parsed.errors?.[0] ?? parsed;
  } catch {
    return {};
  }
}

/** Turns what the owner can fix into a sentence; everything else (429, usage caps, 5xx) goes through. */
function explain(error: unknown, key: "owner" | "server"): never {
  if (error instanceof HttpError && key === "server" && [401, 402, 403].includes(error.status)) {
    // Flexwall's own key or X account: nothing the owner can fix, and nothing to reveal about it.
    throw new ConnectorError("X is unavailable on Flexwall right now. Your credits aren't spent while it lasts.");
  }
  if (error instanceof HttpError) {
    const problem = problemOf(error.body);
    const text = `${problem.type ?? ""} ${problem.title ?? ""} ${problem.reason ?? ""}`.toLowerCase();
    if (error.status === 401) {
      throw new ConnectorError("X refused this Bearer Token: copy it again from your app's Keys and tokens page, or regenerate it.");
    }
    if (error.status === 402) {
      throw new ConnectorError("Your X developer account has no credits left: add credits in the X developer console, then try again.");
    }
    if (error.status === 403 && !/usage-capped|rate-limit/.test(text)) {
      if (/client-not-enrolled|client-forbidden/.test(text)) {
        throw new ConnectorError("This X app can't use the API yet: in the X developer console, make sure it belongs to a project and your account has credits.");
      }
      throw new ConnectorError("X refused this Bearer Token access to user lookups: check the app's access in the X developer console.");
    }
  }
  throw error;
}

async function lookup(handle: string, token: string, ctx: ConnectorContext, key: "owner" | "server" = "owner"): Promise<XUser> {
  let body: UserResponse;
  try {
    // One read answers every metric. The token travels in the header only, never in the URL.
    body = await ctx.fetch.json<UserResponse>(`${API}/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    explain(error, key);
  }
  if (body?.data?.id) return body.data;
  // X answers an unknown or suspended handle with 200, an `errors` array and no `data`.
  const problem = body?.errors?.[0];
  if (problem) {
    if (/suspended/i.test(problem.detail ?? "")) throw new ConnectorError(`The X account @${handle} is suspended.`);
    if (/resource-not-found/.test(problem.type ?? "") || /could not find/i.test(problem.detail ?? "")) {
      throw new ConnectorError(`X has no account called @${handle}.`);
    }
  }
  throw new Error(`X answered the lookup of @${handle} without a user${problem?.title ? ` (${problem.title})` : ""}.`);
}

function metricsOf(user: XUser): FetchResult {
  const m = user.public_metrics ?? {};
  return {
    followers: count(m.followers_count),
    following: count(m.following_count),
    posts: count(m.post_count ?? m.tweet_count),
    listed: count(m.listed_count),
    likes: count(m.like_count),
  };
}

const METRICS = [
  { id: "followers", name: "Followers", type: "number", unit: "count", defaults: { label: "followers on X" }, leaderboard: "audience" },
  { id: "following", name: "Following", type: "number", unit: "count", defaults: { label: "following on X" } },
  { id: "posts", name: "Posts", description: "Posts, including reposts.", type: "number", unit: "count", defaults: { label: "posts on X" } },
  { id: "listed", name: "Listed", description: "Lists that include this account.", type: "number", unit: "count", defaults: { label: "lists on X" } },
  { id: "likes", name: "Likes", description: "Posts this account has liked.", type: "number", unit: "count", defaults: { label: "likes on X" } },
] as const satisfies ConnectorDef["metrics"];

const SAMPLE = {
  followers: number(1613, { unit: "count" }),
  following: number(284, { unit: "count" }),
  posts: number(3920, { unit: "count" }),
  listed: number(27, { unit: "count" }),
  likes: number(8410, { unit: "count" }),
};

const HANDLE_FIELD = field.text("handle", "X handle", { placeholder: "@XDevelopers", maxLength: 16, pattern: HANDLE_PATTERN, patternMessage: "must be an X handle, like @XDevelopers" });

const xConnector = defineConnector({
  id: "x",
  name: "X with your own key",
  description: "Followers, following, posts, lists and likes of an X account, read with your own X developer app.",
  homepage: "https://x.com",
  // The owner pays X for every read, so running it costs Flexwall nothing.
  tier: "free",
  // An app-only token proves the owner has an X app, not that the handle is theirs.
  verified: false,
  // The floor; each connection refreshes at the pace its owner chose and pays for.
  ttl: MIN_TTL,
  ttlFor: (connection) => ttlForRefresh(connection.refresh),
  auth: {
    label: "Connect X with your own key",
    help:
      "Uses your own X developer app: every refresh is a paid X API read, billed by X to your developer account, not by Flexwall. " +
      "In the X developer console (console.x.com), create a project and an app, buy credits, then open the app's Keys and tokens and copy its Bearer Token (app-only, read access is enough). " +
      "One read per refresh answers every tile of this account, at $0.01 per read. X bills the same profile once per UTC day in most cases, so real spend is usually closer to $0.30 a month whatever you pick.",
    fields: [
      field.secret("token", "Bearer Token", {
        placeholder: "AAAAAAAAAAAAAAAAAAAAA…",
        maxLength: 1000,
        pattern: "^\\S{20,1000}$",
        patternMessage: "must be the token alone, without \"Bearer \" or spaces",
      }),
      HANDLE_FIELD,
      field.select(
        "refresh",
        "Refresh",
        REFRESH_HOURS.map((hours) => ({ value: String(hours), label: refreshLabel(hours) })),
        { default: String(DEFAULT_REFRESH_HOURS), help: "Tiles never read X more often than this, however many show this account." }
      ),
    ],
  },
  metrics: [...METRICS],

  // The handle lives on the connection, and the host adds the connection to the key: one lookup answers every metric.
  cacheKey: () => "profile",

  async fetch({ secret, public: settings }, ctx) {
    const token = secret?.token;
    const handle = normalizeHandle(settings?.handle);
    if (!token || !handle) return {};
    return metricsOf(await lookup(handle, token, ctx));
  },

  async connect(input, ctx) {
    const token = String(input.token ?? "").trim();
    const handle = normalizeHandle(input.handle);
    const refresh = String(input.refresh ?? DEFAULT_REFRESH_HOURS);
    const user = await lookup(handle, token, ctx);
    return {
      secret: { token },
      public: { handle, userId: user.id, refresh: String(ttlForRefresh(refresh) / 3600), hint: `…${token.slice(-4)}` },
      label: `@${user.username || handle}`,
      accountId: user.id,
    };
  },

  sample: SAMPLE,
});

/** How often a credits connection reads X. X counts a profile once per UTC day, so later reads that day should be free; four a day keeps the cost bounded if they aren't. */
export const CREDITS_TTL = 6 * 3600;

const xCreditsConnector = defineConnector({
  id: "x-credits",
  name: "X",
  description: "Followers, following, posts, lists and likes of an X account, read for you: no X developer app needed.",
  homepage: "https://x.com",
  tier: "free",
  // A handle anyone can type proves nothing about who owns it.
  verified: false,
  ttl: CREDITS_TTL,
  auth: {
    label: "Connect X",
    help: "No X developer account needed: Flexwall reads the profile with its own X app, on any plan. One read answers every tile of this account.",
    fields: [HANDLE_FIELD],
  },
  // X has one API: the server's bearer token reads the real x.com.
  server(ctx) {
    const token = ctx.env("X_BEARER_TOKEN");
    return { configured: Boolean(token), environment: "production", detail: token ? "bearer token set" : "X_BEARER_TOKEN unset" };
  },

  metrics: [...METRICS],
  cacheKey: () => "profile",

  async fetch({ public: settings }, ctx) {
    const handle = normalizeHandle(settings?.handle);
    if (!handle) return {};
    const token = ctx.env("X_BEARER_TOKEN");
    if (!token) throw new ConnectorError("This Flexwall server has no X app.");
    return metricsOf(await lookup(handle, token, ctx, "server"));
  },

  // No read here: connecting would be a free lookup. An unknown handle shows on the first refresh, which then costs nothing.
  async connect(input, ctx) {
    if (!ctx.env("X_BEARER_TOKEN")) throw new ConnectorError("This Flexwall server has no X app.");
    const handle = normalizeHandle(input.handle);
    if (!new RegExp(HANDLE_PATTERN).test(handle)) throw new ConnectorError("That isn't an X handle.");
    return { secret: {}, public: { handle }, label: `@${handle}`, accountId: handle };
  },

  sample: SAMPLE,
});

export default definePlugin({
  id: "x",
  name: "X",
  description: "Followers, following, posts, lists and likes of an X account, with your own X developer app or Flexwall credits.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [xConnector, xCreditsConnector],
});

export { xConnector, xCreditsConnector };
