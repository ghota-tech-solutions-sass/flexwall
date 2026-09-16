import { ConnectorError, defineConnector, definePlugin, ExpiredCredentialsError, HttpError, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Instagram through the owner's own professional account: the Instagram API
 * with Instagram Login ("Business Login for Instagram"), scope
 * `instagram_business_basic`, then one `GET /me` answers every metric.
 *
 * The sign-in trades the code for a short-lived token (one hour), then at once
 * for a long-lived one (60 days). Meta's API takes the app secret in the query
 * string of that one exchange (`GET /access_token?grant_type=ig_exchange_token`)
 * and has no body form for it: that URL is never logged, and an error from it is
 * rethrown without the URL. Everything else sends the secret in a POST body and
 * the token in an Authorization header, except the refresh endpoint, which
 * Meta documents with the token in the query string.
 *
 * Meta doesn't document PKCE for Instagram Login, so none is sent.
 */

export const AUTHORIZE = "https://www.instagram.com/oauth/authorize";
export const SHORT_TOKEN = "https://api.instagram.com/oauth/access_token";
export const GRAPH = "https://graph.instagram.com";
export const VERSION = "v25.0";
export const SCOPES = ["instagram_business_basic"];
export const IDENTITY_FIELDS = "user_id,username,account_type";
export const COUNT_FIELDS = "followers_count,follows_count,media_count";

/** A long-lived token can only be refreshed once it's at least 24 hours old. */
export const REFRESH_MIN_AGE = 24 * 3600_000;
/** How long a too-young token is kept before trying again: past the 24 hours, with room for the host's early refresh window. */
export const YOUNG_TOKEN_RETRY = 25 * 3600_000;

// The slices of Meta's answers this connector reads.
export interface ShortToken {
  access_token?: string;
  user_id?: string | number;
  permissions?: string | string[];
}
export interface LongToken {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}
export interface Profile {
  id?: string;
  user_id?: string | number;
  username?: string;
  account_type?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}
interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
  // api.instagram.com answers in the older flat shape.
  error_type?: string;
  code?: number;
  error_message?: string;
}

function app(ctx: ConnectorContext): { id: string; secret: string } {
  const id = ctx.env("INSTAGRAM_APP_ID");
  const secret = ctx.env("INSTAGRAM_APP_SECRET");
  if (!id || !secret) throw new ConnectorError("This Flexwall server has no Instagram app.");
  return { id, secret };
}

/** Meta wraps some answers in `data: [ … ]` in its examples and not in others: accept both. */
function unwrap<T extends object>(body: T | { data?: T[] } | null | undefined): T | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return body as T;
}

function graphError(error: HttpError): { code: number | null; subcode: number | null } {
  try {
    const body = JSON.parse(error.body) as GraphError;
    return { code: body.error?.code ?? body.code ?? null, subcode: body.error?.error_subcode ?? null };
  } catch {
    return { code: null, subcode: null };
  }
}

/** The same failure without the request URL or body, for calls whose URL carries a secret or a token. */
const scrubbed = (error: HttpError, path: string) => new HttpError(error.status, `${GRAPH}${path}`, "");

const RATE_LIMITS = new Set([4, 17, 32, 613]);
const REVOKED = "Reconnect Instagram: the sign-in expired or was revoked.";
const PROFILE_REFUSED = "Reconnect Instagram and allow Flexwall to read your profile.";
const REFUSED = "Instagram refused this sign-in: the code expired or was already used. Try connecting again.";

const expiresAt = (seconds: number | undefined) => Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
const count = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw) ? number(raw, { unit: "count" }) : null);
const hasBasic = (permissions: ShortToken["permissions"]) =>
  (Array.isArray(permissions) ? permissions : String(permissions ?? "").split(",")).map((p) => p.trim()).includes("instagram_business_basic");

async function readProfile(fields: string, accessToken: string, ctx: ConnectorContext): Promise<Profile> {
  try {
    const body = await ctx.fetch.json<Profile | { data?: Profile[] }>(`${GRAPH}/${VERSION}/me?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const profile = unwrap(body);
    if (!profile) throw new Error("Instagram answered without a profile.");
    return profile;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    const { code, subcode } = graphError(error);
    if (code === 190 || code === 102) {
      // Password changed (460) or the app removed from the account (458): a refresh can't fix these.
      if (subcode === 458 || subcode === 460) throw new ConnectorError(REVOKED);
      throw new ExpiredCredentialsError("Instagram says the access token expired.");
    }
    if (code === 10 || (code !== null && code >= 200 && code <= 299)) throw new ConnectorError(PROFILE_REFUSED);
    throw error;
  }
}

const instagramConnector = defineConnector({
  id: "instagram",
  name: "Instagram",
  description: "Verified followers and posts of your own Instagram professional account.",
  homepage: "https://www.instagram.com",
  tier: "free",
  verified: true,
  // Follower counts move slowly; one call an hour per account is far below Meta's per-account call budget.
  ttl: 3600,
  auth: {
    label: "Sign in with Instagram",
    help: "You'll sign in on Instagram and allow Flexwall to read your profile (instagram_business_basic): username, followers, following and post count. Only professional accounts work, Creator or Business: switch a personal account in Instagram under Settings → Account type and tools before connecting.",
    fields: [],
    oauth: {
      async authorize({ redirectUri, state }, ctx) {
        const { id } = app(ctx);
        const query = new URLSearchParams({ client_id: id, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state });
        return { url: `${AUTHORIZE}?${query.toString()}` };
      },

      async complete({ query, redirectUri }, ctx) {
        const { id, secret } = app(ctx);
        if (query.error) {
          if (query.error === "access_denied") throw new ConnectorError("You declined to connect Instagram.");
          throw new ConnectorError("Instagram couldn't finish signing you in. Try connecting again.");
        }
        // Instagram appends "#_" to the redirect; it isn't part of the code.
        const code = String(query.code ?? "").replace(/#_?$/, "");
        if (!code) throw new ConnectorError("Instagram didn't send a sign-in code. Try connecting again.");

        let short: ShortToken | null;
        try {
          short = unwrap(
            await ctx.fetch.json<ShortToken | { data?: ShortToken[] }>(SHORT_TOKEN, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
              body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }).toString(),
            })
          );
        } catch (error) {
          if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429) throw new ConnectorError(REFUSED);
          throw error;
        }
        if (!short?.access_token) throw new ConnectorError(REFUSED);
        if (short.permissions !== undefined && !hasBasic(short.permissions)) throw new ConnectorError(PROFILE_REFUSED);

        // Meta's design: the app secret goes in this GET's query string. Never log this URL.
        let long: LongToken;
        try {
          long = await ctx.fetch.json<LongToken>(
            `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short.access_token)}`,
            { headers: { Accept: "application/json" } }
          );
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          if (error.status >= 400 && error.status < 500 && error.status !== 429) throw new ConnectorError(REFUSED);
          throw scrubbed(error, "/access_token");
        }
        if (!long?.access_token) throw new ConnectorError(REFUSED);

        const profile = await readProfile(IDENTITY_FIELDS, long.access_token, ctx);
        const type = String(profile.account_type ?? "").toUpperCase();
        if (type && type !== "BUSINESS" && type !== "MEDIA_CREATOR") {
          throw new ConnectorError("Instagram only shares numbers of professional accounts: switch this account to Creator or Business in Instagram's settings, then connect again.");
        }
        const userId = String(profile.user_id ?? short.user_id ?? profile.id ?? "");
        const username = profile.username ?? "";
        return {
          secret: { accessToken: long.access_token, issuedAt: String(Date.now()) },
          public: { username, ...(userId ? { userId } : {}) },
          label: username ? `Instagram (@${username})` : "Instagram",
          ...(userId ? { accountId: userId } : {}),
          expiresAt: expiresAt(long.expires_in),
        };
      },

      async refresh({ secret }, ctx) {
        return renew(secret, ctx);
      },
    },
  },

  server(ctx) {
    const id = ctx.env("INSTAGRAM_APP_ID");
    return {
      configured: Boolean(id && ctx.env("INSTAGRAM_APP_SECRET")),
      // Meta's app credentials don't name a mode: INSTAGRAM_ENV says whether the app is live or still in development.
      environment: ctx.env("INSTAGRAM_ENV")?.trim().toLowerCase() === "production" ? "production" : "sandbox",
      detail: id ? "app id set" : "INSTAGRAM_APP_ID unset",
    };
  },

  metrics: [
    { id: "followers", name: "Followers", type: "number", unit: "count", defaults: { label: "followers" }, leaderboard: "audience" },
    { id: "following", name: "Following", description: "Accounts you follow.", type: "number", unit: "count", defaults: { label: "following" } },
    { id: "posts", name: "Posts", description: "Posts on your profile, as Instagram counts media.", type: "number", unit: "count", defaults: { label: "posts" } },
  ],

  // One profile call answers every metric.
  cacheKey: () => "account",

  async fetch({ secret }, ctx) {
    if (!secret?.accessToken) return {};
    const profile = await readProfile(COUNT_FIELDS, secret.accessToken, ctx);
    const out: FetchResult = {
      followers: count(profile.followers_count),
      following: count(profile.follows_count),
      posts: count(profile.media_count),
    };
    return out;
  },

  sample: {
    followers: number(23_800, { unit: "count" }),
    following: number(318, { unit: "count" }),
    posts: number(412, { unit: "count" }),
  },
});

/**
 * Long-lived tokens refresh for another 60 days, but only once they're 24 hours
 * old. A younger one is kept as it is, with an expiry just past that age, so
 * the host comes back when a refresh can work. No request is made for it.
 */
export async function renew(secret: Record<string, string>, ctx: ConnectorContext, now = Date.now()): Promise<{ secret: Record<string, string>; expiresAt: number }> {
  if (!secret.accessToken) throw new ConnectorError(REVOKED);
  const issuedAt = Number(secret.issuedAt);
  if (Number.isFinite(issuedAt) && issuedAt <= now && now - issuedAt < REFRESH_MIN_AGE) {
    return { secret, expiresAt: issuedAt + YOUNG_TOKEN_RETRY };
  }
  let renewed: LongToken;
  try {
    // Meta documents the token in this GET's query string. Never log this URL.
    renewed = await ctx.fetch.json<LongToken>(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(secret.accessToken)}`, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    const { code } = graphError(error);
    if (code !== null && RATE_LIMITS.has(code)) throw scrubbed(error, "/refresh_access_token");
    if (error.status >= 400 && error.status < 500 && error.status !== 429) throw new ConnectorError(REVOKED);
    throw scrubbed(error, "/refresh_access_token");
  }
  if (!renewed?.access_token) throw new ConnectorError(REVOKED);
  return { secret: { accessToken: renewed.access_token, issuedAt: String(now) }, expiresAt: now + Math.max(0, Number(renewed.expires_in) || 0) * 1000 };
}

export default definePlugin({
  id: "instagram",
  name: "Instagram",
  description: "Verified followers and posts from your own Instagram professional account.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [instagramConnector],
});

export { instagramConnector };
