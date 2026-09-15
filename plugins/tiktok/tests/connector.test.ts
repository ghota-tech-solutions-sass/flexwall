import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, ExpiredCredentialsError, HttpError, number, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import tiktok, { AUTHORIZE, STATS_FIELDS, TOKEN, tiktokConnector, USER_INFO } from "../src/index";

/** Responses shaped after the examples in TikTok's User Access Token Management and Get User Info guides. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const CLIENT_KEY = "awxyz0123456789ab";
const CLIENT_SECRET = "tiktokclientsecret0123456789abcd";
const env = { TIKTOK_CLIENT_KEY: CLIENT_KEY, TIKTOK_CLIENT_SECRET: CLIENT_SECRET };
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const CODE = "Qk8tT5cAuthCodeFromTikTok0123";
const ACCESS = "act.example12345Example12345Example";
const REFRESH = "rft.example12345Example12345Example";
const oauth = tiktokConnector.auth!.oauth!;
const secret = { accessToken: ACCESS, refreshToken: REFRESH };
const request = (metrics: string[]) => ({ metrics, params: {}, secret, public: { displayName: "Ada Lovelace" } });
const apiError = (status: number, code: string) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify({ data: {}, error: { code, message: "", log_id: "202208291947" } }));
};
const userInfo = (init: GuardedFetchInit | undefined, url: string) => (new URL(url).searchParams.get("fields")?.includes("follower_count") ? fixture("user-stats") : fixture("user-basic"));

describe("tiktok plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([tiktok]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the definition, when read, then it's a free, verified oauth connector with nothing to type and followers on the audience board", () => {
    // Given
    const c = tiktokConnector;

    // When
    const audience = c.metrics.filter((m) => m.leaderboard === "audience").map((m) => m.id);

    // Then
    expect([c.tier, c.verified, c.connect, c.auth?.fields]).toEqual(["free", true, undefined, []]);
    expect(audience).toEqual(["followers"]);
    expect(c.metrics.some((m) => m.sensitive)).toBe(false);
  });

  describe("authorize", () => {
    test("given a server app, when authorizing, then the URL carries the client key, both scopes, the redirect and state, without PKCE or the secret", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const { url, carry } = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "st4te-xyz" }, ctx);

      // Then
      const parsed = new URL(url);
      expect(`${parsed.origin}${parsed.pathname}`).toBe(AUTHORIZE);
      expect(parsed.searchParams.get("client_key")).toBe(CLIENT_KEY);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(parsed.searchParams.get("state")).toBe("st4te-xyz");
      expect(url).toEndWith("&scope=user.info.basic,user.info.stats");
      expect(parsed.searchParams.get("scope")).toBe("user.info.basic,user.info.stats");
      expect(parsed.searchParams.has("code_challenge")).toBe(false);
      expect(url).not.toContain(CLIENT_SECRET);
      expect(carry).toBeUndefined();
      expect(ctx.calls).toEqual([]);
    });

    test("given a server without a TikTok app, when authorizing, completing or refreshing, then each says so before any request", async () => {
      // Given
      const ctx = fakeContext({ [TOKEN]: fixture("token"), [USER_INFO]: userInfo }, { env: { TIKTOK_CLIENT_KEY: CLIENT_KEY } });

      // When
      const errors = await Promise.all([
        oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "s" }, fakeContext({})).catch((e: unknown) => e),
        oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e),
        oauth.refresh!({ secret, public: {} }, ctx).catch((e: unknown) => e),
      ]);

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toBe("This Flexwall server has no TikTok app.");
      }
      expect(ctx.calls).toEqual([]);
    });
  });

  describe("complete", () => {
    test("given a code, when completing, then it's exchanged in a form body and the account's name and open id describe the connection", async () => {
      // Given
      const sent: (GuardedFetchInit | undefined)[] = [];
      const ctx = fakeContext(
        {
          [TOKEN]: (init) => {
            sent.push(init);
            return fixture("token");
          },
          [USER_INFO]: (init, url) => {
            sent.push(init);
            return userInfo(init, url);
          },
        },
        { env }
      );
      const before = Date.now();

      // When
      const result = await oauth.complete({ fields: {}, query: { code: CODE, scopes: "user.info.basic,user.info.stats", state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      expect(result.secret).toEqual({ accessToken: ACCESS, refreshToken: REFRESH });
      expect(result.public).toEqual({ displayName: "Ada Lovelace" });
      expect(result.label).toBe("TikTok (Ada Lovelace)");
      expect(result.accountId).toBe("afd97af1-b87b-48b9-ac98-410aghda5344");
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 86400 * 1000);
      expect(sent[0]?.method).toBe("POST");
      expect(sent[0]?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(sent[0]?.body ?? ""))).toEqual({ client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, code: CODE, grant_type: "authorization_code", redirect_uri: REDIRECT });
      expect(sent[1]?.headers?.Authorization).toBe(`Bearer ${ACCESS}`);
      expect(ctx.calls).toEqual([TOKEN, `${USER_INFO}?fields=open_id,display_name`]);
      const shown = JSON.stringify([result.public, result.label, result.accountId, ctx.calls]);
      for (const hidden of [ACCESS, REFRESH, CODE, CLIENT_SECRET]) expect(shown).not.toContain(hidden);
    });

    test("given the owner declined, when completing, then they're told so and nothing is requested", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { error: "access_denied", error_description: "User cancelled", state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("You declined to connect TikTok.");
      expect(ctx.calls).toEqual([]);
    });

    test("given a code TikTok refuses, with an error status or inside a 200, when completing, then the owner gets a sentence without the code or secret", async () => {
      // Given
      const asStatus = fakeContext(
        {
          [TOKEN]: (_init, url) => {
            throw new HttpError(400, url, JSON.stringify(fixture("token-error")));
          },
        },
        { env }
      );
      const inBody = fakeContext({ [TOKEN]: fixture("token-error") }, { env });

      // When
      const errors = await Promise.all([asStatus, inBody].map((ctx) => oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e)));

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toContain("TikTok refused this sign-in");
        expect((error as Error).message).not.toContain(CODE);
        expect((error as Error).message).not.toContain(CLIENT_SECRET);
      }
    });

    test("given the owner unticked the statistics scope, when completing, then they're asked to allow it before any profile read", async () => {
      // Given
      const ctx = fakeContext({ [TOKEN]: { ...fixture("token"), scope: "user.info.basic" }, [USER_INFO]: userInfo }, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("profile statistics");
      expect(ctx.calls).toEqual([TOKEN]);
    });

    test("given a token answer without a scope list, when completing, then the sign-in isn't refused for it", async () => {
      // Given
      const token = fixture("token");
      delete token.scope;
      const ctx = fakeContext({ [TOKEN]: token, [USER_INFO]: userInfo }, { env });

      // When
      const result = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      expect(result.label).toBe("TikTok (Ada Lovelace)");
    });
  });

  describe("refresh", () => {
    test("given a refresh token, when refreshing, then the rotated refresh token and a new expiry come back", async () => {
      // Given
      let body = "";
      const ctx = fakeContext(
        {
          [TOKEN]: (init) => {
            body = init?.body ?? "";
            return fixture("refresh");
          },
        },
        { env }
      );

      // When
      const result = await oauth.refresh!({ secret, public: {} }, ctx);

      // Then
      expect(result.secret).toEqual({ accessToken: "act.renewed67890Renewed67890Renewed", refreshToken: "rft.rotated67890Rotated67890Rotated" });
      expect(result.expiresAt).toBeGreaterThan(Date.now() + 86000 * 1000);
      expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, grant_type: "refresh_token", refresh_token: REFRESH });
      expect(ctx.calls).toEqual([TOKEN]);
    });

    test("given a revoked or expired refresh token, when refreshing, then the owner is asked to reconnect", async () => {
      // Given
      const ctx = fakeContext({ [TOKEN]: { error: "invalid_grant", error_description: "Refresh token is invalid or expired.", log_id: "2022" } }, { env });

      // When
      const error = await oauth.refresh!({ secret, public: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toStartWith("Reconnect TikTok:");
      expect((error as Error).message).not.toContain(REFRESH);
    });
  });

  describe("fetch", () => {
    test("given an account, when every metric is fetched, then one user info call with the token in a header answers them", async () => {
      // Given
      let headers: Record<string, string> | undefined;
      const ctx = fakeContext({
        [USER_INFO]: (init, url) => {
          headers = init?.headers;
          return userInfo(init, url);
        },
      });

      // When
      const values = await tiktokConnector.fetch(request(["followers", "likes", "videos", "following"]), ctx);

      // Then
      expect(values).toEqual({
        followers: number(48321, { unit: "count" }),
        likes: number(1204917, { unit: "count" }),
        videos: number(186, { unit: "count" }),
        following: number(212, { unit: "count" }),
      });
      expect(ctx.calls).toEqual([`${USER_INFO}?fields=${STATS_FIELDS}`]);
      expect(headers?.Authorization).toBe(`Bearer ${ACCESS}`);
      expect(ctx.calls.join()).not.toContain(ACCESS);
      expect(new Set(tiktokConnector.metrics.map((m) => tiktokConnector.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
    });

    test("given a stats field TikTok leaves out, when fetched, then that metric has no value", async () => {
      // Given
      const stats = fixture("user-stats");
      delete stats.data.user.likes_count;
      const ctx = fakeContext({ [USER_INFO]: stats });

      // When
      const values = await tiktokConnector.fetch(request(["likes", "followers"]), ctx);

      // Then
      expect(values.likes).toBeNull();
      expect(values.followers).toEqual(number(48321, { unit: "count" }));
    });

    test("given an expired access token, when fetched, then the host is told to refresh", async () => {
      // Given
      const ctx = fakeContext({ [USER_INFO]: apiError(401, "access_token_invalid") });

      // When
      const error = await tiktokConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ExpiredCredentialsError);
      expect((error as Error).message).not.toContain(ACCESS);
    });

    test("given a token without the statistics scope, when fetched, then the owner is asked to reconnect and allow it, not a refresh", async () => {
      // Given
      const routes = [apiError(401, "scope_not_authorized"), apiError(400, "scope_permission_missed")];

      // When
      const errors = await Promise.all(routes.map((route) => tiktokConnector.fetch(request(["followers"]), fakeContext({ [USER_INFO]: route })).catch((e: unknown) => e)));

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toContain("Reconnect TikTok");
      }
    });

    test("given a rate limit, when fetched, then the error passes through untouched", async () => {
      // Given
      const limited = new HttpError(429, USER_INFO, JSON.stringify({ error: { code: "rate_limit_exceeded", message: "", log_id: "1" } }));
      const ctx = fakeContext({
        [USER_INFO]: () => {
          throw limited;
        },
      });

      // When
      const error = await tiktokConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBe(limited);
    });
  });
});
