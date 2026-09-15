import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, ExpiredCredentialsError, HttpError, number, text, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import twitch, { HELIX, ID, twitchConnector } from "../src/index";

/** Responses copied from the examples in Twitch's authentication guides and Helix API reference. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const CLIENT_ID = "wbmytr93xzw8zbg0p1izqyzzc5mbiz";
const CLIENT_SECRET = "s3cr3tclientsecretvalue0000000";
const env = { TWITCH_CLIENT_ID: CLIENT_ID, TWITCH_CLIENT_SECRET: CLIENT_SECRET };
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const CODE = "gulfwdmys5lsm6qyz4xiz9q32l10";
const ACCESS = "rfx2uswqe8l4g1mkagrvg5tv0ks3";
const REFRESH = "5b93chm6hdve3mycz05zfzatkfdenfspp1h1ar2xxdalen01";
const oauth = twitchConnector.auth!.oauth!;
const secret = { accessToken: ACCESS, refreshToken: REFRESH };
const request = (metrics: string[], over: Record<string, string> = {}) => ({ metrics, params: {}, secret: { ...secret, ...over }, public: { login: "twitchdev", displayName: "TwitchDev" } });
const refuse = (status: number, body: unknown) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify(body));
};
const invalidToken = { error: "Unauthorized", status: 401, message: "Invalid OAuth token" };
const everything = () => ({
  [`${ID}/validate`]: fixture("validate"),
  [`${HELIX}/channels/followers`]: fixture("followers"),
  [`${HELIX}/subscriptions`]: fixture("subscriptions"),
  [`${HELIX}/streams`]: fixture("streams-live"),
});

describe("twitch plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([twitch]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the definition, when read, then it's a free, verified oauth connector with nothing to type and followers on the audience board", () => {
    // Given
    const c = twitchConnector;

    // When
    const audience = c.metrics.filter((m) => m.leaderboard === "audience").map((m) => m.id);

    // Then
    expect(c.tier).toBe("free");
    expect(c.verified).toBe(true);
    expect(c.connect).toBeUndefined();
    expect(c.auth?.fields).toEqual([]);
    expect(audience).toEqual(["followers"]);
    expect(c.metrics.some((m) => m.sensitive)).toBe(false);
  });

  describe("authorize", () => {
    test("given a server app, when authorizing, then the Twitch URL carries the client id, redirect, state and the one scope, without PKCE or the secret", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const { url, carry } = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "st4te-xyz" }, ctx);

      // Then
      const parsed = new URL(url);
      expect(`${parsed.origin}${parsed.pathname}`).toBe(`${ID}/authorize`);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(parsed.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(parsed.searchParams.get("state")).toBe("st4te-xyz");
      expect(parsed.searchParams.get("scope")).toBe("channel:read:subscriptions");
      expect(parsed.searchParams.has("code_challenge")).toBe(false);
      expect(url).not.toContain(CLIENT_SECRET);
      expect(carry).toBeUndefined();
      expect(ctx.calls).toEqual([]);
    });

    test("given a server without a Twitch app, when authorizing, completing, refreshing or fetching, then each says so before any request", async () => {
      // Given
      const ctx = fakeContext(everything(), { env: { TWITCH_CLIENT_ID: CLIENT_ID } });
      const bare = fakeContext(everything());

      // When
      const errors = await Promise.all([
        oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: "s" }, bare).catch((e: unknown) => e),
        oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e),
        oauth.refresh!({ secret, public: {} }, ctx).catch((e: unknown) => e),
        twitchConnector.fetch(request(["followers"]), bare).catch((e: unknown) => e),
      ]);

      // Then
      for (const error of errors) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).toBe("This Flexwall server has no Twitch app.");
      }
      expect(ctx.calls).toEqual([]);
      expect(bare.calls).toEqual([]);
    });
  });

  describe("complete", () => {
    test("given a code, when completing, then it's exchanged with the secret in a form body and the channel becomes the connection", async () => {
      // Given
      const sent: (GuardedFetchInit | undefined)[] = [];
      const ctx = fakeContext(
        {
          [`${ID}/token`]: (init) => {
            sent.push(init);
            return fixture("token");
          },
          [`${HELIX}/users`]: (init) => {
            sent.push(init);
            return fixture("users");
          },
        },
        { env }
      );
      const before = Date.now();

      // When
      const result = await oauth.complete({ fields: {}, query: { code: CODE, scope: "channel:read:subscriptions", state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx);

      // Then
      expect(result.secret).toEqual({ accessToken: ACCESS, refreshToken: REFRESH });
      expect(result.public).toEqual({ login: "twitchdev", displayName: "TwitchDev" });
      expect(result.label).toBe("Twitch (TwitchDev)");
      expect(result.accountId).toBe("141981764");
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 14124 * 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 14124 * 1000);
      const body = new URLSearchParams(sent[0]?.body ?? "");
      expect(sent[0]?.method).toBe("POST");
      expect(sent[0]?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(body)).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: CODE, grant_type: "authorization_code", redirect_uri: REDIRECT });
      expect(sent[1]?.headers).toMatchObject({ Authorization: `Bearer ${ACCESS}`, "Client-Id": CLIENT_ID });
      expect(ctx.calls).toEqual([`${ID}/token`, `${HELIX}/users`]);
      const shown = JSON.stringify([result.public, result.label, result.accountId, ctx.calls]);
      for (const hidden of [ACCESS, REFRESH, CODE, CLIENT_SECRET]) expect(shown).not.toContain(hidden);
    });

    test("given the owner declined, when completing, then they're told so and nothing is requested", async () => {
      // Given
      const ctx = fakeContext({}, { env });

      // When
      const error = await oauth
        .complete({ fields: {}, query: { error: "access_denied", error_description: "The user denied you access", state: "s" }, redirectUri: REDIRECT, carry: {} }, ctx)
        .catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("You declined to connect Twitch.");
      expect(ctx.calls).toEqual([]);
    });

    test("given a code Twitch refuses, when completing, then the owner gets a sentence without the code or the secret", async () => {
      // Given
      const ctx = fakeContext({ [`${ID}/token`]: refuse(400, { status: 400, message: "Invalid authorization code" }) }, { env });

      // When
      const error = await oauth.complete({ fields: {}, query: { code: CODE }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("Twitch refused this sign-in");
      expect((error as Error).message).not.toContain(CODE);
      expect((error as Error).message).not.toContain(CLIENT_SECRET);
    });
  });

  describe("refresh", () => {
    test("given a refresh token, when refreshing, then the rotated refresh token and a new expiry come back", async () => {
      // Given
      let body = "";
      const ctx = fakeContext(
        {
          [`${ID}/token`]: (init) => {
            body = init?.body ?? "";
            return fixture("refresh");
          },
        },
        { env }
      );

      // When
      const result = await oauth.refresh!({ secret, public: {} }, ctx);

      // Then
      expect(result.secret).toEqual({ accessToken: "1ssjqsqfy6bads1ws7m03gras79zfr", refreshToken: "eyJfMzUtNDU0OC4MWYwLTQ5MDY5ODY4NGNlMSJ9%asdfasdf=" });
      expect(result.expiresAt).toBeGreaterThan(Date.now() + 15000 * 1000);
      expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token", refresh_token: REFRESH });
      expect(ctx.calls).toEqual([`${ID}/token`]);
    });

    test("given a revoked refresh token, when refreshing, then the owner is asked to reconnect", async () => {
      // Given
      const ctx = fakeContext({ [`${ID}/token`]: refuse(400, { error: "Bad Request", status: 400, message: "Invalid refresh token" }) }, { env });

      // When
      const error = await oauth.refresh!({ secret, public: {} }, ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toStartWith("Reconnect Twitch:");
      expect((error as Error).message).not.toContain(REFRESH);
    });
  });

  describe("fetch", () => {
    test("given every metric while live, when fetched, then the token is validated and followers, subscribers, live and viewers come back", async () => {
      // Given
      const ctx = fakeContext(everything(), { env });

      // When
      const values = await twitchConnector.fetch(request(["followers", "subscribers", "live", "viewers"]), ctx);

      // Then
      expect(values).toEqual({
        followers: number(8, { unit: "count" }),
        subscribers: number(13, { unit: "count" }),
        live: text("Live"),
        viewers: number(78365, { unit: "count" }),
      });
      expect(ctx.calls).toEqual([
        `${ID}/validate`,
        `${HELIX}/channels/followers?broadcaster_id=141981764`,
        `${HELIX}/subscriptions?broadcaster_id=141981764&first=1`,
        `${HELIX}/streams?user_id=141981764`,
      ]);
      for (const call of ctx.calls) for (const hidden of [ACCESS, REFRESH, CLIENT_SECRET]) expect(call).not.toContain(hidden);
      expect(new Set(twitchConnector.metrics.map((m) => twitchConnector.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
    });

    test("given an offline channel, when live status is fetched, then it's Offline with zero viewers and nothing else is requested", async () => {
      // Given
      const ctx = fakeContext({ ...everything(), [`${HELIX}/streams`]: { data: [], pagination: {} } }, { env });

      // When
      const values = await twitchConnector.fetch(request(["live"]), ctx);

      // Then
      expect(values).toEqual({ live: text("Offline"), viewers: number(0, { unit: "count" }) });
      expect(ctx.calls).toEqual([`${ID}/validate`, `${HELIX}/streams?user_id=141981764`]);
    });

    test("given a token without the subscriptions scope, when subscribers are fetched, then there's no number and no request for it", async () => {
      // Given
      const ctx = fakeContext({ ...everything(), [`${ID}/validate`]: { ...fixture("validate"), scopes: [] } }, { env });

      // When
      const values = await twitchConnector.fetch(request(["subscribers"]), ctx);

      // Then
      expect(values).toEqual({ subscribers: null });
      expect(ctx.calls).toEqual([`${ID}/validate`]);
    });

    test("given a channel Twitch won't list subscriptions for, when subscribers are fetched, then there's no number rather than an error", async () => {
      // Given
      const ctx = fakeContext({ ...everything(), [`${HELIX}/subscriptions`]: refuse(401, { error: "Unauthorized", status: 401, message: "Missing scope: channel:read:subscriptions" }) }, { env });

      // When
      const values = await twitchConnector.fetch(request(["subscribers"]), ctx);

      // Then
      expect(values).toEqual({ subscribers: null });
    });

    test("given an expired access token, when fetched, then the host is told to refresh", async () => {
      // Given
      const ctx = fakeContext({ ...everything(), [`${ID}/validate`]: refuse(401, { status: 401, message: "invalid access token" }) }, { env });

      // When
      const error = await twitchConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ExpiredCredentialsError);
      expect(ctx.calls).toEqual([`${ID}/validate`]);
    });

    test("given a token that expires between validation and a Helix read, when fetched, then the host is told to refresh", async () => {
      // Given
      const ctx = fakeContext({ ...everything(), [`${HELIX}/channels/followers`]: refuse(401, invalidToken) }, { env });

      // When
      const error = await twitchConnector.fetch(request(["followers"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBeInstanceOf(ExpiredCredentialsError);
      expect((error as Error).message).not.toContain(ACCESS);
    });

    test("given a rate limit, when fetched, then the error passes through untouched", async () => {
      // Given
      const limited = new HttpError(429, `${HELIX}/streams`, "");
      const ctx = fakeContext(
        {
          ...everything(),
          [`${HELIX}/streams`]: () => {
            throw limited;
          },
        },
        { env }
      );

      // When
      const error = await twitchConnector.fetch(request(["live"]), ctx).catch((e: unknown) => e);

      // Then
      expect(error).toBe(limited);
    });
  });
});

describe("disconnect", () => {
  const disconnect = twitchConnector.auth!.disconnect!;
  const shown = { login: "twitchdev", displayName: "TwitchDev" };

  test("given a connection, when it is removed, then the access and refresh tokens are each revoked with the client id, form-encoded", async () => {
    // Given
    const sent: { url: string; init: GuardedFetchInit | undefined }[] = [];
    const ctx = fakeContext(
      {
        [`${ID}/revoke`]: (init, url) => {
          sent.push({ url, init });
          return "";
        },
      },
      { env }
    );

    // When
    await disconnect({ secret, public: shown }, ctx);

    // Then
    expect(sent.map((s) => s.url)).toEqual([`${ID}/revoke`, `${ID}/revoke`]);
    for (const { init } of sent) {
      expect(init?.method).toBe("POST");
      expect(init?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    }
    const bodies = sent.map((s) => Object.fromEntries(new URLSearchParams(String(s.init?.body))));
    expect(bodies).toEqual([
      { client_id: CLIENT_ID, token: ACCESS },
      { client_id: CLIENT_ID, token: REFRESH },
    ]);
    expect(JSON.stringify(sent)).not.toContain(CLIENT_SECRET);
  });

  test("given tokens Twitch no longer knows, when the connection is removed, then it resolves", async () => {
    // Given
    const ctx = fakeContext({ [`${ID}/revoke`]: refuse(400, { status: 400, message: "Invalid token" }) }, { env });

    // When
    const result = await disconnect({ secret, public: shown }, ctx);

    // Then
    expect(result).toBeUndefined();
    expect(ctx.calls).toHaveLength(2);
  });

  test("given no Twitch app on the server or no stored token, when the connection is removed, then it resolves without a request", async () => {
    // Given
    const noApp = fakeContext({}, { env: { TWITCH_CLIENT_SECRET: CLIENT_SECRET } });
    const noToken = fakeContext({}, { env });

    // When
    await disconnect({ secret, public: shown }, noApp);
    await disconnect({ secret: { accessToken: "", refreshToken: "" }, public: shown }, noToken);

    // Then
    expect([...noApp.calls, ...noToken.calls]).toEqual([]);
  });

  test("given Twitch refuses the client or fails, when the connection is removed, then it throws without a token", async () => {
    // Given
    const unknownClient = fakeContext({ [`${ID}/revoke`]: refuse(404, { status: 404, message: "client does not exist" }) }, { env });
    const outage = fakeContext({ [`${ID}/revoke`]: refuse(503, { status: 503, message: "Service Unavailable" }) }, { env });

    // When
    const errors = await Promise.all([unknownClient, outage].map((ctx) => disconnect({ secret, public: shown }, ctx).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(HttpError);
      const message = (error as Error).message;
      expect([ACCESS, REFRESH, CLIENT_SECRET].filter((s) => message.includes(s))).toEqual([]);
    }
  });
});
