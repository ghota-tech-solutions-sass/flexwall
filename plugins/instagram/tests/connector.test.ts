import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, ExpiredCredentialsError, HttpError, number, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import instagram, { AUTHORIZE, COUNT_FIELDS, GRAPH, IDENTITY_FIELDS, instagramConnector, renew, SHORT_TOKEN, VERSION } from "../src/index";

/** Responses shaped after the examples in Meta's Business Login for Instagram guide and Graph API error reference. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const APP_ID = "990602627938098";
const APP_SECRET = "a1b2C3D4e5f6instagramappsecret";
const env = { INSTAGRAM_APP_ID: APP_ID, INSTAGRAM_APP_SECRET: APP_SECRET };
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const CODE = "AQBx-hBsH3codeFromInstagram";
const SHORT = "EAACEdEose0shortLivedExample";
const LONG = "IGAAlongLivedExampleToken0123456789";
const REFRESHED = "IGAArefreshedExampleToken9876543210";
const DAY = 24 * 3600_000;
const oauth = instagramConnector.auth!.oauth!;
const ME = `${GRAPH}/${VERSION}/me`;
const EXCHANGE = `${GRAPH}/access_token`;
const REFRESH = `${GRAPH}/refresh_access_token`;
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { accessToken: LONG, issuedAt: "0" }, public: { username: "flexwall.lol" } });
const fail = (status: number, body: unknown) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify(body));
};
const me = (_init: GuardedFetchInit | undefined, url: string) => (new URL(url).searchParams.get("fields") === IDENTITY_FIELDS ? fixture("me-identity") : fixture("me-counts"));
const signIn = () => ({ [SHORT_TOKEN]: fixture("short-token"), [EXCHANGE]: fixture("long-token"), [ME]: me });

describe("instagram plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([instagram]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the definition, when read, then it's a free, verified oauth connector with nothing to type and followers on the audience board", () => {
    // Given
    const c = instagramConnector;

    // When
    const audience = c.metrics.filter((m) => m.leaderboard === "audience").map((m) => m.id);

    // Then
    expect([c.tier, c.verified, c.connect, c.auth?.fields]).toEqual(["free", true, undefined, []]);
    expect(audience).toEqual(["followers"]);
    expect(c.metrics.some((m) => m.sensitive)).toBe(false);
  });

  describe("authorize", () => {
    test("given a server app, when authorizing, then the URL carries the app id, redirect, state and the basic scope, without PKCE or the secret", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const { url, carry } = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "st4te-xyz" }, ctx);

      // Then
      const parsed = new URL(url);
      expect(`${parsed.origin}${parsed.pathname}`).toBe(AUTHORIZE);
      expect(parsed.searchParams.get("client_id")).toBe(APP_ID);
      expect(parsed.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("instagram_business_basic");
      expect(parsed.searchParams.get("state")).toBe("st4te-xyz");
      expect(parsed.searchParams.has("code_challenge")).toBe(false);
      expect(url).not.toContain(APP_SECRET);
      expect(carry).toBeUndefined();
      expect(ctx.calls).toEqual([]);
    });

    test("given a server without an Instagram app, when authorizing or completing, then each says so before any request", async () => {
      // Given
      const ctx = fakeContext(signIn(), { env: { INSTAGRAM_APP_ID: APP_ID } });

      // When
      const errors = await Promise.all([
        oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "s" }, fakeContext({})).catch((e: unknown) => e),
        oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e),
      ]);

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toBe("This Flexwall server has no Instagram app.");
      }
      expect(ctx.calls).toEqual([]);
    });
  });

  describe("complete", () => {
    test("given a code, when completing, then it becomes a long-lived token and the professional account describes the connection", async () => {
      // Given
      const sent: Record<string, GuardedFetchInit | undefined> = {};
      const record = (name: string, body: (init: GuardedFetchInit | undefined, url: string) => unknown) => (init: GuardedFetchInit | undefined, url: string) => {
        sent[name] = init;
        return body(init, url);
      };
      const ctx = fakeContext(
        { [SHORT_TOKEN]: record("short", () => fixture("short-token")), [EXCHANGE]: record("exchange", () => fixture("long-token")), [ME]: record("me", me) },
        { env }
      );
      const before = Date.now();

      // When
      const result = await oauth.complete({ fields: {}, query: { code: `${CODE}#_`, state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      expect(result.secret.accessToken).toBe(LONG);
      expect(Number(result.secret.issuedAt)).toBeGreaterThanOrEqual(before);
      expect(result.public).toEqual({ username: "flexwall.lol", userId: "17841405793187218" });
      expect(result.label).toBe("Instagram (@flexwall.lol)");
      expect(result.accountId).toBe("17841405793187218");
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 5183944 * 1000);
      expect(sent.short?.method).toBe("POST");
      expect(sent.short?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(sent.short?.body ?? ""))).toEqual({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: "authorization_code", redirect_uri: REDIRECT, code: CODE });
      expect(sent.me?.headers?.Authorization).toBe(`Bearer ${LONG}`);
      expect(ctx.calls).toHaveLength(3);
      expect(ctx.calls[0]).toBe(SHORT_TOKEN);
      expect(ctx.calls[2]).toBe(`${ME}?fields=${IDENTITY_FIELDS}`);
      const shown = JSON.stringify([result.public, result.label, result.accountId]);
      for (const hidden of [SHORT, LONG, CODE, APP_SECRET]) expect(shown).not.toContain(hidden);
    });

    test("given Meta's design, when completing, then the app secret and short-lived token appear in the exchange URL only, and no URL carries the code or long-lived token", async () => {
      // Given
      const ctx = fakeContext(signIn(), { env });

      // When
      await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      const exchange = new URL(ctx.calls[1]!);
      expect(`${exchange.origin}${exchange.pathname}`).toBe(EXCHANGE);
      expect(exchange.searchParams.get("grant_type")).toBe("ig_exchange_token");
      expect(exchange.searchParams.get("client_secret")).toBe(APP_SECRET);
      expect(exchange.searchParams.get("access_token")).toBe(SHORT);
      const others = [ctx.calls[0], ctx.calls[2]].join(" ");
      for (const hidden of [APP_SECRET, SHORT, LONG, CODE]) expect(others).not.toContain(hidden);
      expect(ctx.calls.join(" ")).not.toContain(CODE);
      expect(ctx.calls.join(" ")).not.toContain(LONG);
    });

    test("given the owner declined, when completing, then they're told so and nothing is requested", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const error = await oauth
        .complete({ fields: {}, query: { error: "access_denied", error_reason: "user_denied", error_description: "The user denied your request", state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx)
        .catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("You declined to connect Instagram.");
      expect(ctx.calls).toEqual([]);
    });

    test("given a code that was already used, when completing, then the owner gets a sentence without the code or secret", async () => {
      // Given
      const ctx = fakeContext({ ...signIn(), [SHORT_TOKEN]: fail(400, fixture("code-used")) }, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("Instagram refused this sign-in");
      for (const hidden of [CODE, APP_SECRET]) expect((error as Error).message).not.toContain(hidden);
      expect(ctx.calls).toEqual([SHORT_TOKEN]);
    });

    test("given an outage during the secret-bearing exchange, when completing, then the error passes through without the URL that carries the secret", async () => {
      // Given
      const ctx = fakeContext({ ...signIn(), [EXCHANGE]: fail(503, { secret: APP_SECRET }) }, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(503);
      const leaked = JSON.stringify([(error as HttpError).url, (error as HttpError).body, (error as Error).message]);
      for (const hidden of [APP_SECRET, SHORT]) expect(leaked).not.toContain(hidden);
    });

    test("given a personal account, when completing, then the owner is told to switch to a professional account", async () => {
      // Given
      const ctx = fakeContext({ ...signIn(), [ME]: { ...fixture("me-identity"), account_type: "PERSONAL" } }, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("professional accounts");
    });

    test("given Meta's documented profile answer wrapped in data, when completing, then it's read the same way", async () => {
      // Given
      const ctx = fakeContext({ ...signIn(), [ME]: { data: [{ user_id: "17841405793187218", username: "flexwall.lol" }] } }, { env });

      // When
      const result = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      expect(result.label).toBe("Instagram (@flexwall.lol)");
      expect(result.accountId).toBe("17841405793187218");
    });
  });

  describe("refresh", () => {
    test("given a token older than a day, when refreshing, then a new 60-day token and its issue time come back", async () => {
      // Given
      const now = Date.parse("2026-09-15T12:00:00Z");
      const ctx = fakeContext({ [REFRESH]: fixture("refreshed-token") });

      // When
      const result = await renew({ accessToken: LONG, issuedAt: String(now - 3 * DAY) }, ctx, now);

      // Then
      expect(result.secret).toEqual({ accessToken: REFRESHED, issuedAt: String(now) });
      expect(result.expiresAt).toBe(now + 5183944 * 1000);
      const url = new URL(ctx.calls[0]!);
      expect(`${url.origin}${url.pathname}`).toBe(REFRESH);
      expect(url.searchParams.get("grant_type")).toBe("ig_refresh_token");
      expect(ctx.calls.join(" ")).not.toContain(APP_SECRET);
    });

    test("given a token younger than a day, when refreshing, then it's kept as is until past its first day, with no request", async () => {
      // Given
      const now = Date.parse("2026-09-15T12:00:00Z");
      const issuedAt = now - 2 * 3600_000;
      const ctx = fakeContext({});

      // When
      const result = await renew({ accessToken: LONG, issuedAt: String(issuedAt) }, ctx, now);

      // Then
      expect(result.secret).toEqual({ accessToken: LONG, issuedAt: String(issuedAt) });
      expect(result.expiresAt).toBe(issuedAt + 25 * 3600_000);
      expect(ctx.calls).toEqual([]);
    });

    test("given the host's refresh hook and no app credentials, when refreshing an old token, then it still works, since refresh needs no app secret", async () => {
      // Given
      const ctx = fakeContext({ [REFRESH]: fixture("refreshed-token") });

      // When
      const result = await oauth.refresh!({ secret: { accessToken: LONG, issuedAt: "0" }, public: {} }, ctx);

      // Then
      expect(result.secret.accessToken).toBe(REFRESHED);
    });

    test("given an expired or revoked token, when refreshing, then the owner is asked to reconnect without the token in the message", async () => {
      // Given
      const ctx = fakeContext({ [REFRESH]: fail(400, fixture("expired")) });

      // When
      const error = await renew({ accessToken: LONG, issuedAt: "0" }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toStartWith("Reconnect Instagram:");
      expect((error as Error).message).not.toContain(LONG);
    });

    test("given a rate limit while refreshing, when refreshing, then it passes through without the URL that carries the token", async () => {
      // Given
      const ctx = fakeContext({ [REFRESH]: fail(400, { error: { message: "Application request limit reached", type: "OAuthException", code: 4 } }) });

      // When
      const error = await renew({ accessToken: LONG, issuedAt: "0" }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).url).not.toContain(LONG);
      expect((error as HttpError).body).toBe("");
    });
  });

  describe("fetch", () => {
    test("given an account, when every metric is fetched, then one profile call with the token in a header answers them", async () => {
      // Given
      let headers: Record<string, string> | undefined;
      const ctx = fakeContext({
        [ME]: (init, url) => {
          headers = init?.headers;
          return me(init, url);
        },
      });

      // When
      const values = await instagramConnector.fetch(request(["followers", "following", "posts"]), ctx);

      // Then
      expect(values).toEqual({ followers: number(23817, { unit: "count" }), following: number(318, { unit: "count" }), posts: number(412, { unit: "count" }) });
      expect(ctx.calls).toEqual([`${ME}?fields=${COUNT_FIELDS}`]);
      expect(headers?.Authorization).toBe(`Bearer ${LONG}`);
      expect(ctx.calls.join(" ")).not.toContain(LONG);
      expect(new Set(instagramConnector.metrics.map((m) => instagramConnector.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
    });

    test("given an expired token, when fetched, then the host is told to refresh", async () => {
      // Given
      const ctx = fakeContext({ [ME]: fail(400, fixture("expired")) });

      // When
      const error = await instagramConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ExpiredCredentialsError);
      expect((error as Error).message).not.toContain(LONG);
    });

    test("given a changed password or a removed app, when fetched, then the owner is asked to reconnect rather than a refresh", async () => {
      // Given
      const routes = [460, 458].map((subcode) => fail(400, { error: { message: "Error validating access token", type: "OAuthException", code: 190, error_subcode: subcode } }));

      // When
      const errors = await Promise.all(routes.map((route) => instagramConnector.fetch(request(["followers"]), fakeContext({ [ME]: route })).catch((e: unknown) => e)));

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toStartWith("Reconnect Instagram:");
      }
    });

    test("given a missing permission, when fetched, then the owner is asked to reconnect and allow it", async () => {
      // Given
      const ctx = fakeContext({ [ME]: fail(403, { error: { message: "Application does not have permission for this action", type: "OAuthException", code: 10 } }) });

      // When
      const error = await instagramConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("allow Flexwall to read your profile");
    });

    test("given a rate limit, when fetched, then the error passes through untouched", async () => {
      // Given
      const limited = new HttpError(400, ME, JSON.stringify({ error: { message: "Application request limit reached", type: "OAuthException", code: 4 } }));
      const ctx = fakeContext({
        [ME]: () => {
          throw limited;
        },
      });

      // When
      const error = await instagramConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBe(limited);
    });
  });

  test("given the server's Instagram app, when the back office asks what it points at, then an unset INSTAGRAM_ENV stays sandbox", () => {
    // Given
    const missing = fakeContext({}, { env: {} });
    const live = fakeContext({}, { env: { ...env, INSTAGRAM_ENV: "production" } });
    const unset = fakeContext({}, { env });

    // When
    const [a, b, c] = [missing, live, unset].map((ctx) => instagramConnector.server!(ctx));

    // Then
    expect(a.configured).toBe(false);
    expect(b).toEqual({ configured: true, environment: "production", detail: "app id set" });
    expect(c.environment).toBe("sandbox");
  });
});
