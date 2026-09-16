import { ConnectorError, defineConnector, definePlugin, ExpiredCredentialsError, HttpError, number, text, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

/**
 * Twitch through the owner's own account: sign in with Twitch (authorization
 * code flow for a confidential client), then Helix reads with the owner's
 * user access token and the server app's Client-Id.
 *
 * One scope, `channel:read:subscriptions`, for the subscriber total. The
 * follower total needs none: Get Channel Followers returns `total` to any
 * user token, and only the follower list needs `moderator:read:followers`.
 * Live status comes from Get Streams, which needs no scope either.
 *
 * Twitch doesn't document PKCE for this flow, so there's no verifier: the
 * client secret stays on the server and the host checks `state`.
 */

export const ID = "https://id.twitch.tv/oauth2";
export const HELIX = "https://api.twitch.tv/helix";
export const SCOPES = ["channel:read:subscriptions"];

// The slices of Twitch answers this connector reads.
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string[];
  token_type?: string;
}
export interface Validation {
  client_id: string;
  login: string;
  scopes: string[] | null;
  user_id: string;
  expires_in: number;
}
export interface Users {
  data: { id: string; login: string; display_name: string; broadcaster_type: string }[];
}
export interface Followers {
  total: number;
}
export interface Subscriptions {
  total: number | null;
}
export interface Streams {
  data: { type: string; viewer_count: number }[];
}

function clientId(ctx: ConnectorContext): string {
  const id = ctx.env("TWITCH_CLIENT_ID");
  if (!id) throw new ConnectorError("This Flexwall server has no Twitch app.");
  return id;
}

function app(ctx: ConnectorContext): { id: string; secret: string } {
  const id = ctx.env("TWITCH_CLIENT_ID");
  const secret = ctx.env("TWITCH_CLIENT_SECRET");
  if (!id || !secret) throw new ConnectorError("This Flexwall server has no Twitch app.");
  return { id, secret };
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const FORM = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };

/** Twitch's error message, e.g. "Invalid OAuth token" or "Missing scope: channel:read:subscriptions". Never shown to owners. */
function messageOf(error: HttpError): string {
  try {
    return String((JSON.parse(error.body) as { message?: unknown }).message ?? "");
  } catch {
    return "";
  }
}

/** A 401 about the scope or the channel is permanent; any other 401 means the token no longer works. */
const isScopeProblem = (error: HttpError) => /scope|must match|moderator/i.test(messageOf(error));

async function helix<T>(path: string, token: string, id: string, ctx: ConnectorContext): Promise<T> {
  try {
    return await ctx.fetch.json<T>(`${HELIX}${path}`, { headers: { Authorization: `Bearer ${token}`, "Client-Id": id, Accept: "application/json" } });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401 && !isScopeProblem(error)) throw new ExpiredCredentialsError("Twitch says the access token expired.");
    throw error;
  }
}

async function token(fields: Record<string, string>, ctx: ConnectorContext, refused: string): Promise<TokenResponse> {
  try {
    const body = await ctx.fetch.json<TokenResponse>(`${ID}/token`, { method: "POST", headers: FORM, body: form(fields) });
    if (!body?.access_token) throw new ConnectorError(refused);
    return body;
  } catch (error) {
    // Never echo error.body: keep upstream details out of what owners see.
    if (error instanceof HttpError && (error.status === 400 || error.status === 401 || error.status === 403)) throw new ConnectorError(refused);
    throw error;
  }
}

const expiresAt = (seconds: number) => Date.now() + Math.max(0, Number(seconds) || 0) * 1000;

const twitchConnector = defineConnector({
  id: "twitch",
  name: "Twitch",
  description: "Verified followers, subscribers and live status of your own Twitch channel.",
  homepage: "https://www.twitch.tv",
  tier: "free",
  verified: true,
  // Live status is the fast mover. Helix allows 800 points a minute per app; three reads every 15 minutes is far below it.
  ttl: 900,
  auth: {
    label: "Sign in with Twitch",
    help: "You'll sign in on Twitch and allow Flexwall to read your channel's subscriptions (channel:read:subscriptions), used only for the subscriber total. Followers and live status need no extra permission. Any Twitch account works; subscribers only count for Affiliates and Partners.",
    fields: [],
    oauth: {
      async authorize({ redirectUri, state }, ctx) {
        const { id } = app(ctx);
        const query = new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: redirectUri, scope: SCOPES.join(" "), state });
        return { url: `${ID}/authorize?${query.toString().replace(/\+/g, "%20")}` };
      },

      async complete({ query, redirectUri }, ctx) {
        const { id, secret } = app(ctx);
        if (query.error) {
          if (query.error === "access_denied") throw new ConnectorError("You declined to connect Twitch.");
          throw new ConnectorError("Twitch couldn't finish signing you in. Try connecting again.");
        }
        if (!query.code) throw new ConnectorError("Twitch didn't send a sign-in code. Try connecting again.");
        const granted = await token(
          { client_id: id, client_secret: secret, code: query.code, grant_type: "authorization_code", redirect_uri: redirectUri },
          ctx,
          "Twitch refused this sign-in: the code expired or was already used. Try connecting again."
        );
        const users = await helix<Users>("/users", granted.access_token, id, ctx);
        const user = users.data?.[0];
        if (!user) throw new ConnectorError("Twitch didn't say which account signed in. Try connecting again.");
        return {
          secret: { accessToken: granted.access_token, refreshToken: granted.refresh_token ?? "" },
          public: { login: user.login, displayName: user.display_name },
          label: `Twitch (${user.display_name || user.login})`,
          accountId: user.id,
          expiresAt: expiresAt(granted.expires_in),
        };
      },

      async refresh({ secret }, ctx) {
        const { id, secret: clientSecret } = app(ctx);
        if (!secret.refreshToken) throw new ConnectorError("Reconnect Twitch: this connection has no way to renew its sign-in.");
        const renewed = await token(
          { client_id: id, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: secret.refreshToken },
          ctx,
          "Reconnect Twitch: the sign-in was revoked or can no longer be renewed."
        );
        // Refresh tokens may change: keep the new one when Twitch sends it.
        return { secret: { accessToken: renewed.access_token, refreshToken: renewed.refresh_token || secret.refreshToken }, expiresAt: expiresAt(renewed.expires_in) };
      },
    },

    /**
     * Revokes the sign-in: `POST /oauth2/revoke` with the client id and each
     * stored token, in parallel. Twitch documents it for access tokens; the
     * refresh token is sent too, because the stored access token has often
     * expired already and the grant would otherwise stay alive. A token
     * Twitch doesn't know (400 "Invalid token") is revoked already.
     */
    async disconnect({ secret }, ctx) {
      const id = ctx.env("TWITCH_CLIENT_ID");
      const tokens = [secret.accessToken, secret.refreshToken].filter((t): t is string => Boolean(t));
      if (!id || tokens.length === 0) return;
      await Promise.all(
        tokens.map(async (token) => {
          try {
            await ctx.fetch.text(`${ID}/revoke`, { method: "POST", headers: FORM, body: form({ client_id: id, token }) });
          } catch (error) {
            if (error instanceof HttpError && error.status === 400 && /invalid token/i.test(messageOf(error))) return;
            throw error;
          }
        })
      );
    },
  },

  // Twitch has one API: an app registered there is always live.
  server(ctx) {
    const id = ctx.env("TWITCH_CLIENT_ID");
    return {
      configured: Boolean(id && ctx.env("TWITCH_CLIENT_SECRET")),
      environment: "production",
      detail: id ? "client id and secret set" : "TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET unset",
    };
  },

  metrics: [
    { id: "followers", name: "Followers", type: "number", unit: "count", defaults: { label: "followers" }, leaderboard: "audience" },
    { id: "subscribers", name: "Subscribers", description: "Paid and gifted subscriptions to your channel. Affiliates and Partners only.", type: "number", unit: "count", defaults: { label: "subs" } },
    { id: "live", name: "Live status", description: "\"Live\" while you're streaming, \"Offline\" otherwise.", type: "text", defaults: { label: "on Twitch" } },
    { id: "viewers", name: "Viewers now", description: "People watching your stream right now, 0 when you're offline.", type: "number", unit: "count", defaults: { label: "watching" } },
  ],

  // One validation answers who the token belongs to; each metric adds at most one Helix read.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    const id = clientId(ctx);
    if (!secret?.accessToken) return {};
    const accessToken = secret.accessToken;

    // Twitch requires apps that keep OAuth sessions to validate tokens; it also tells us the channel and the granted scopes.
    let validation: Validation;
    try {
      validation = await ctx.fetch.json<Validation>(`${ID}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) throw new ExpiredCredentialsError("Twitch says the access token expired.");
      throw error;
    }
    const channel = encodeURIComponent(validation.user_id);
    const out: FetchResult = {};
    const reads: Promise<void>[] = [];

    if (metrics.includes("followers")) {
      reads.push(
        helix<Followers>(`/channels/followers?broadcaster_id=${channel}`, accessToken, id, ctx).then((body) => {
          out.followers = typeof body.total === "number" ? number(body.total, { unit: "count" }) : null;
        })
      );
    }

    if (metrics.includes("subscribers")) {
      if (!(validation.scopes ?? []).includes("channel:read:subscriptions")) out.subscribers = null;
      else
        reads.push(
          helix<Subscriptions>(`/subscriptions?broadcaster_id=${channel}&first=1`, accessToken, id, ctx).then(
            (body) => {
              out.subscribers = typeof body.total === "number" ? number(body.total, { unit: "count" }) : null;
            },
            (error: unknown) => {
              // A channel without a subscription program, or a scope Twitch won't honour: no number, not a broken tile.
              if (error instanceof HttpError && [400, 401, 403, 404].includes(error.status)) out.subscribers = null;
              else throw error;
            }
          )
        );
    }

    if (metrics.includes("live") || metrics.includes("viewers")) {
      reads.push(
        helix<Streams>(`/streams?user_id=${channel}`, accessToken, id, ctx).then((body) => {
          const stream = (body.data ?? []).find((s) => s.type === "live");
          out.live = text(stream ? "Live" : "Offline");
          out.viewers = number(stream && typeof stream.viewer_count === "number" ? stream.viewer_count : 0, { unit: "count" });
        })
      );
    }

    await Promise.all(reads);
    return out;
  },

  sample: {
    followers: number(18_420, { unit: "count" }),
    subscribers: number(312, { unit: "count" }),
    live: text("Live"),
    viewers: number(427, { unit: "count" }),
  },
});

export default definePlugin({
  id: "twitch",
  name: "Twitch",
  description: "Verified followers, subscribers and live status from your own Twitch channel.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [twitchConnector],
});

export { twitchConnector };
