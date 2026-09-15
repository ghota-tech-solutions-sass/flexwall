import { ConnectorError, defineConnector, definePlugin, ExpiredCredentialsError, HttpError, number, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * TikTok through the owner's own account: Login Kit for Web (OAuth v2) with
 * the `user.info.basic` and `user.info.stats` scopes, then one Display API
 * call, `GET /v2/user/info/`, answers every metric.
 *
 * TikTok documents PKCE (`code_verifier`) as required for mobile and desktop
 * apps only; a web app authenticates with its client secret, so none is sent.
 *
 * TikTok reports API errors in an `error` object, `code: "ok"` on success,
 * both on 2xx and on error statuses: every call reads it.
 */

export const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
export const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
export const USER_INFO = "https://open.tiktokapis.com/v2/user/info/";
export const REVOKE = "https://open.tiktokapis.com/v2/oauth/revoke/";
export const SCOPES = ["user.info.basic", "user.info.stats"];
export const STATS_FIELDS = "open_id,follower_count,following_count,likes_count,video_count";

// The slices of TikTok answers this connector reads.
export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}
export interface UserInfo {
  data?: { user?: { open_id?: string; display_name?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number } };
  error?: { code?: string; message?: string; log_id?: string };
}

function app(ctx: ConnectorContext): { key: string; secret: string } {
  const key = ctx.env("TIKTOK_CLIENT_KEY");
  const secret = ctx.env("TIKTOK_CLIENT_SECRET");
  if (!key || !secret) throw new ConnectorError("This Flexwall server has no TikTok app.");
  return { key, secret };
}

const STATS_REFUSED = "Reconnect TikTok and allow Flexwall to read your profile statistics.";

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** The body of a 2xx, or of the HttpError ctx.fetch threw, so both paths read TikTok's error the same way. */
async function call<T>(ctx: ConnectorContext, url: string, init: Parameters<ConnectorContext["fetch"]["json"]>[1]): Promise<{ body: T | null; error: HttpError | null }> {
  try {
    return { body: await ctx.fetch.json<T>(url, init), error: null };
  } catch (error) {
    if (error instanceof HttpError) return { body: parse<T>(error.body), error };
    throw error;
  }
}

async function token(fields: Record<string, string>, ctx: ConnectorContext, refused: string): Promise<Required<Pick<TokenResponse, "access_token">> & TokenResponse> {
  const { body, error } = await call<TokenResponse>(ctx, TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache", Accept: "application/json" },
    body: new URLSearchParams(fields).toString(),
  });
  if (error) {
    // Rate limits and outages are TikTok's to fix: keep them as they are. Never echo the body.
    if (error.status === 429 || error.status >= 500) throw error;
    throw new ConnectorError(refused);
  }
  if (!body?.access_token || body.error) throw new ConnectorError(refused);
  return body as Required<Pick<TokenResponse, "access_token">> & TokenResponse;
}

async function userInfo(fields: string, accessToken: string, ctx: ConnectorContext): Promise<NonNullable<NonNullable<UserInfo["data"]>["user"]>> {
  const { body, error } = await call<UserInfo>(ctx, `${USER_INFO}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  const code = body?.error?.code ?? (error ? "" : "ok");
  if (code === "access_token_invalid") throw new ExpiredCredentialsError("TikTok says the access token is invalid or expired.");
  if (code === "scope_not_authorized" || code === "scope_permission_missed") throw new ConnectorError(STATS_REFUSED);
  if (error) throw error;
  if (code !== "ok") throw new Error(`TikTok answered ${code.replace(/[^a-z_]/gi, "")}.`);
  const user = body?.data?.user;
  if (!user) throw new Error("TikTok answered without a user.");
  return user;
}

/** Answers meaning the token is dead already: nothing left to revoke. */
const ALREADY_REVOKED = new Set(["access_token_invalid", "invalid_grant", "invalid_token"]);

/** The error code of a TikTok answer: a string on OAuth endpoints, `error.code` on the others. "" when none. */
function errorCodeOf(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  const code = typeof error === "string" ? error : (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "";
}

const expiresAt = (seconds: number | undefined) => Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
const count = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw) ? number(raw, { unit: "count" }) : null);

const tiktokConnector = defineConnector({
  id: "tiktok",
  name: "TikTok",
  description: "Verified followers, likes and videos of your own TikTok account.",
  homepage: "https://www.tiktok.com",
  tier: "free",
  verified: true,
  // Counts move slowly for most accounts; one call an hour per account is far below TikTok's per-minute limits.
  ttl: 3600,
  auth: {
    label: "Sign in with TikTok",
    help: "You'll sign in on TikTok and allow Flexwall to read your basic profile (name and avatar) and your profile statistics: followers, following, likes and video count. Flexwall can't see your videos, messages or anything else. Any TikTok account works: personal, creator or business.",
    fields: [],
    oauth: {
      async authorize({ redirectUri, state }, ctx) {
        const { key } = app(ctx);
        const query = new URLSearchParams({ client_key: key, response_type: "code", redirect_uri: redirectUri, state });
        // TikTok's examples show raw commas between scopes; scope names are URL-safe, so they go unencoded.
        return { url: `${AUTHORIZE}?${query.toString()}&scope=${SCOPES.join(",")}` };
      },

      async complete({ query, redirectUri }, ctx) {
        const { key, secret } = app(ctx);
        if (query.error) {
          if (query.error === "access_denied") throw new ConnectorError("You declined to connect TikTok.");
          // TikTok documents `error` as "the current user is not eligible for using third-party login".
          throw new ConnectorError("TikTok didn't let this account sign in to Flexwall: it may not be eligible for third-party login.");
        }
        if (!query.code) throw new ConnectorError("TikTok didn't send a sign-in code. Try connecting again.");
        const granted = await token(
          { client_key: key, client_secret: secret, code: query.code, grant_type: "authorization_code", redirect_uri: redirectUri },
          ctx,
          "TikTok refused this sign-in: the code expired or was already used. Try connecting again."
        );
        // Only judge the scopes TikTok reports; without a list, the profile read below tells.
        if (granted.scope !== undefined && !granted.scope.split(",").map((s) => s.trim()).includes("user.info.stats")) throw new ConnectorError(STATS_REFUSED);
        const user = await userInfo("open_id,display_name", granted.access_token, ctx);
        const openId = user.open_id ?? granted.open_id;
        return {
          secret: { accessToken: granted.access_token, refreshToken: granted.refresh_token ?? "" },
          public: { displayName: user.display_name ?? "" },
          label: user.display_name ? `TikTok (${user.display_name})` : "TikTok",
          ...(openId ? { accountId: openId } : {}),
          expiresAt: expiresAt(granted.expires_in),
        };
      },

      async refresh({ secret }, ctx) {
        const { key, secret: clientSecret } = app(ctx);
        if (!secret.refreshToken) throw new ConnectorError("Reconnect TikTok: this connection has no way to renew its sign-in.");
        const renewed = await token(
          { client_key: key, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: secret.refreshToken },
          ctx,
          "Reconnect TikTok: the sign-in was revoked or has expired."
        );
        // "The returned refresh_token may be different than the one passed": always keep the newest.
        return { secret: { accessToken: renewed.access_token, refreshToken: renewed.refresh_token || secret.refreshToken }, expiresAt: expiresAt(renewed.expires_in) };
      },
    },

    /**
     * Revokes the sign-in: `POST /v2/oauth/revoke/` with the app's key and
     * secret and the owner's access token, which removes Flexwall from their
     * "Manage app permissions". The answer is empty on success, so it's read
     * as text; errors can come in a 2xx too. A token TikTok calls invalid is
     * revoked or expired already.
     */
    async disconnect({ secret }, ctx) {
      const key = ctx.env("TIKTOK_CLIENT_KEY");
      const clientSecret = ctx.env("TIKTOK_CLIENT_SECRET");
      if (!key || !clientSecret || !secret.accessToken) return;
      let raw: string;
      try {
        raw = await ctx.fetch.text(REVOKE, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache", Accept: "application/json" },
          body: new URLSearchParams({ client_key: key, client_secret: clientSecret, token: secret.accessToken }).toString(),
        });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        const code = errorCodeOf(parse(error.body));
        if (ALREADY_REVOKED.has(code) || error.status === 401) return;
        throw error;
      }
      const code = errorCodeOf(parse(raw));
      if (!code || code === "ok" || ALREADY_REVOKED.has(code)) return;
      throw new Error(`TikTok answered ${code.replace(/[^a-z_]/gi, "")} to the revoke.`);
    },
  },
  metrics: [
    { id: "followers", name: "Followers", type: "number", unit: "count", defaults: { label: "followers" }, leaderboard: "audience" },
    { id: "likes", name: "Likes", description: "Likes across all your videos.", type: "number", unit: "count", defaults: { label: "likes" } },
    { id: "videos", name: "Videos", description: "Videos on your profile.", type: "number", unit: "count", defaults: { label: "videos" } },
    { id: "following", name: "Following", description: "Accounts you follow.", type: "number", unit: "count", defaults: { label: "following" } },
  ],

  // One user info call answers every metric.
  cacheKey: () => "account",

  async fetch({ secret }, ctx) {
    if (!secret?.accessToken) return {};
    const user = await userInfo(STATS_FIELDS, secret.accessToken, ctx);
    const out: FetchResult = {
      followers: count(user.follower_count),
      likes: count(user.likes_count),
      videos: count(user.video_count),
      following: count(user.following_count),
    };
    return out;
  },

  sample: {
    followers: number(48_300, { unit: "count" }),
    likes: number(1_204_900, { unit: "count" }),
    videos: number(186, { unit: "count" }),
    following: number(212, { unit: "count" }),
  },
});

export default definePlugin({
  id: "tiktok",
  name: "TikTok",
  description: "Verified followers, likes and videos from your own TikTok account.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [tiktokConnector],
});

export { tiktokConnector };
