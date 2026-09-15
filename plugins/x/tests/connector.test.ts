import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, {
  DEFAULT_REFRESH_HOURS,
  monthlyCostUsd,
  normalizeHandle,
  PRICE_PER_USER_READ_USD,
  readsPerMonth,
  refreshLabel,
  REFRESH_HOURS,
  xConnector,
  xCreditsConnector,
} from "../src/index";

/**
 * Fixtures follow docs.x.com: `user.json` is the User lookup page's example response, the
 * 200-with-errors bodies follow the shape X documents for partial errors, and the 401, 402
 * and 403 bodies are the ones developers report from the live API.
 */
const raw = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const fixture = (name: string) => JSON.parse(raw(name));

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAMLheAAAAAAA0%2BuSeid%2BULvsea4JtiGRiSDSJSI%3DEUifiRBkKG5E2XzMDjRfl76ZC9Ub0wnz4XsNiRVBChTYbJcE3F";
const LOOKUP = "https://api.x.com/2/users/by/username/";
const url = (handle: string) => `${LOOKUP}${handle}?user.fields=public_metrics`;
const settings = { handle: "xdevelopers", userId: "2244994945", refresh: "6", hint: "…E3F" };
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { token: TOKEN }, public: settings });
const refuse = (status: number, body: string) => (_init: GuardedFetchInit | undefined, u: string) => {
  throw new HttpError(status, u, body);
};
const errorOf = (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e as Error);
const ALL = ["followers", "following", "posts", "listed", "likes"];

describe("x connector", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the definition, when read, then it's free, unverified, and only followers compete on the audience board", () => {
    // Given
    const metrics = xConnector.metrics;

    // When
    const audience = metrics.filter((m) => m.leaderboard === "audience").map((m) => m.id);

    // Then
    expect(metrics.map((m) => m.id)).toEqual(ALL);
    expect(audience).toEqual(["followers"]);
    expect(xConnector.tier).toBe("free");
    expect(xConnector.verified).toBe(false);
    expect(xConnector.ttl).toBe(3600);
    expect(metrics.every((m) => !m.params?.length)).toBe(true);
  });

  test("given every metric, when grouped, then one cache key covers them all", () => {
    // Given / When
    const keys = ALL.map((metric) => xConnector.cacheKey!({ metric, params: {} }));

    // Then
    expect(new Set(keys).size).toBe(1);
  });

  describe("refresh and cost", () => {
    test("given the price of a user read, when labels are built, then reads and dollars follow from the refresh", () => {
      // Given
      const hours = [...REFRESH_HOURS];

      // When
      const labels = hours.map(refreshLabel);

      // Then
      expect(PRICE_PER_USER_READ_USD).toBe(0.01);
      expect(hours.map(readsPerMonth)).toEqual([720, 120, 30]);
      expect(hours.map(monthlyCostUsd)).toEqual([7.2, 1.2, 0.3]);
      expect(labels).toEqual([
        "Every hour · ~720 reads/month · up to $7.20",
        "Every 6 hours · ~120 reads/month · up to $1.20",
        "Every 24 hours · ~30 reads/month · up to $0.30",
      ]);
    });

    test("given the refresh field, when shown, then it offers each label, defaults to 6 hours, and the help names who bills", () => {
      // Given
      const refresh = xConnector.auth!.fields.find((f) => f.key === "refresh");

      // When
      const options = refresh?.kind === "select" ? refresh.options : [];

      // Then
      expect(options).toEqual(REFRESH_HOURS.map((h) => ({ value: String(h), label: refreshLabel(h) })));
      expect(refresh?.kind === "select" && refresh.default).toBe(String(DEFAULT_REFRESH_HOURS));
      expect(xConnector.auth!.help).toContain("billed by X to your developer account");
    });

    test("given a connection's refresh, when its ttl is asked, then it's the refresh in seconds within an hour and a day", () => {
      // Given
      const ttlFor = xConnector.ttlFor!;

      // When
      const ttls = ["1", "6", "24"].map((refresh) => ttlFor({ refresh }));

      // Then
      expect(ttls).toEqual([3600, 21600, 86400]);
    });

    test("given a refresh out of range, when its ttl is asked, then it's clamped to an hour or a day", () => {
      // Given
      const ttlFor = xConnector.ttlFor!;

      // When
      const ttls = ["0.1", "72"].map((refresh) => ttlFor({ refresh }));

      // Then
      expect(ttls).toEqual([3600, 86400]);
    });

    test("given no usable refresh, when its ttl is asked, then it falls back to 6 hours", () => {
      // Given
      const ttlFor = xConnector.ttlFor!;

      // When
      const connections: Record<string, string>[] = [{}, { refresh: "" }, { refresh: "soon" }, { refresh: "0" }, { refresh: "-3" }];
      const ttls = connections.map((c) => ttlFor(c));

      // Then
      expect(ttls).toEqual([21600, 21600, 21600, 21600, 21600]);
    });
  });

  describe("handles", () => {
    test("given handles typed with an @, capitals or spaces, when validated, then they're accepted and normalised", () => {
      // Given
      const fields = xConnector.auth!.fields;
      const typed = [" @XDevelopers ", "jack", "a_b_1"];

      // When
      const results = typed.map((handle) => validateFields(fields, { token: TOKEN, handle }));

      // Then
      expect(results.map((r) => r.error)).toEqual([null, null, null]);
      expect(results.map((r) => normalizeHandle(r.values.handle))).toEqual(["xdevelopers", "jack", "a_b_1"]);
      expect(results[0].values.refresh).toBe("6");
    });

    test("given names X can't have, when validated, then the owner is told what a handle looks like", () => {
      // Given
      const fields = xConnector.auth!.fields;
      const typed = ["sixteen_chars_ab","dots.not.allowed", "@@double", "x.com/jack"];

      // When
      const errors = typed.map((handle) => validateFields(fields, { token: TOKEN, handle }).error);

      // Then
      expect(new Set(errors)).toEqual(new Set(["X handle must be an X handle, like @XDevelopers."]));
    });

    test("given a token pasted with its Bearer prefix, when validated, then it's refused", () => {
      // Given
      const fields = xConnector.auth!.fields;

      // When
      const { error } = validateFields(fields, { token: `Bearer ${TOKEN}`, handle: "jack" });

      // Then
      expect(error).toBe('Bearer Token must be the token alone, without "Bearer " or spaces.');
    });
  });

  describe("connect", () => {
    test("given a good token and a handle with an @ and capitals, when connecting, then one lookup describes the account without the token", async () => {
      // Given
      const sent: (GuardedFetchInit | undefined)[] = [];
      const ctx = fakeContext({
        [LOOKUP]: (init) => {
          sent.push(init);
          return fixture("user");
        },
      });

      // When
      const result = await xConnector.connect!({ token: TOKEN, handle: "@XDevelopers", refresh: "24" }, ctx);

      // Then
      expect(ctx.calls).toEqual([url("xdevelopers")]);
      expect(sent[0]?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
      expect(result.secret).toEqual({ token: TOKEN });
      expect(result.public).toEqual({ handle: "xdevelopers", userId: "2244994945", refresh: "24", hint: `…${TOKEN.slice(-4)}` });
      expect(result.label).toBe("@XDevelopers");
      expect(result.accountId).toBe("2244994945");
      const shown = JSON.stringify([result.public, result.label, result.accountId, ctx.calls]);
      expect(shown).not.toContain(TOKEN.slice(0, 40));
      expect(shown).not.toContain(TOKEN.slice(-12));
    });

    test("given no refresh, when connecting, then the connection refreshes every 6 hours", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: fixture("user") });

      // When
      const result = await xConnector.connect!({ token: TOKEN, handle: "xdevelopers" }, ctx);

      // Then
      expect(result.public.refresh).toBe("6");
      expect(xConnector.ttlFor!(result.public)).toBe(21600);
    });

    test("given a token X doesn't accept, when connecting, then the owner is told to copy it again", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: refuse(401, raw("unauthorized")) });

      // When
      const error = await errorOf(xConnector.connect!({ token: TOKEN, handle: "jack" }, ctx));

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error?.message).toBe("X refused this Bearer Token: copy it again from your app's Keys and tokens page, or regenerate it.");
      expect(error?.message).not.toContain(TOKEN.slice(-4));
    });

    test("given an account without credits, when connecting, then the owner is told to add credits", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: refuse(402, raw("credits-depleted")) });

      // When
      const error = await errorOf(xConnector.connect!({ token: TOKEN, handle: "jack" }, ctx));

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error?.message).toContain("no credits left");
      expect(error?.message).toContain("X developer console");
    });

    test("given an app that isn't enrolled, when connecting, then the owner is sent to the developer console", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: refuse(403, raw("client-forbidden")) });

      // When
      const error = await errorOf(xConnector.connect!({ token: TOKEN, handle: "jack" }, ctx));

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error?.message).toBe("This X app can't use the API yet: in the X developer console, make sure it belongs to a project and your account has credits.");
    });

    test("given a handle X doesn't know, when connecting, then X answers 200 with errors and the owner gets a sentence", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: fixture("not-found") });

      // When
      const error = await errorOf(xConnector.connect!({ token: TOKEN, handle: "@Nobody_Here_42" }, ctx));

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error?.message).toBe("X has no account called @nobody_here_42.");
    });

    test("given a suspended account, when connecting, then the sentence says so", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: fixture("suspended") });

      // When
      const error = await errorOf(xConnector.connect!({ token: TOKEN, handle: "gone_account" }, ctx));

      // Then
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error?.message).toBe("The X account @gone_account is suspended.");
    });
  });

  describe("fetch", () => {
    test("given every metric, when fetched, then one lookup answers them all and a missing like count is empty", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: fixture("user") });

      // When
      const values = await xConnector.fetch(request(ALL), ctx);

      // Then
      expect(ctx.calls).toEqual([url("xdevelopers")]);
      expect(values).toEqual({
        followers: number(583423, { unit: "count" }),
        following: number(2048, { unit: "count" }),
        posts: number(14052, { unit: "count" }),
        listed: number(1672, { unit: "count" }),
        likes: null,
      });
    });

    test("given a response using the spec's post_count and a like count, when fetched, then both are read", async () => {
      // Given
      const body = { data: { id: "1", username: "jack", public_metrics: { followers_count: 10, following_count: 2, post_count: 30, listed_count: 0, like_count: 44 } } };
      const ctx = fakeContext({ [LOOKUP]: body });

      // When
      const values = await xConnector.fetch(request(ALL), ctx);

      // Then
      expect(values.posts).toEqual(number(30, { unit: "count" }));
      expect(values.listed).toEqual(number(0, { unit: "count" }));
      expect(values.likes).toEqual(number(44, { unit: "count" }));
    });

    test("given a stored handle with capitals, when fetched, then the lookup uses the lowercase handle", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: fixture("user") });

      // When
      await xConnector.fetch({ ...request(["followers"]), public: { ...settings, handle: "@XDevelopers" } }, ctx);

      // Then
      expect(ctx.calls).toEqual([url("xdevelopers")]);
    });

    test("given an account renamed or suspended since connecting, when fetched, then X's 200 with errors becomes a sentence", async () => {
      // Given
      const missing = fakeContext({ [LOOKUP]: fixture("not-found") });
      const suspended = fakeContext({ [LOOKUP]: fixture("suspended") });

      // When
      const first = await errorOf(xConnector.fetch(request(["followers"]), missing));
      const second = await errorOf(xConnector.fetch(request(["followers"]), suspended));

      // Then
      expect(first).toBeInstanceOf(ConnectorError);
      expect(first?.message).toBe("X has no account called @xdevelopers.");
      expect(second).toBeInstanceOf(ConnectorError);
      expect(second?.message).toBe("The X account @xdevelopers is suspended.");
    });

    test("given a 200 with an error X doesn't explain, when fetched, then it goes through as an outage", async () => {
      // Given
      const ctx = fakeContext({ [LOOKUP]: { errors: [{ title: "Internal Error", type: "https://api.x.com/2/problems/internal-error" }] } });

      // When
      const error = await errorOf(xConnector.fetch(request(["followers"]), ctx));

      // Then
      expect(error).not.toBeNull();
      expect(error).not.toBeInstanceOf(ConnectorError);
    });

    test("given a revoked token or spent credits, when fetched, then the owner gets a sentence without the token", async () => {
      // Given
      const revoked = fakeContext({ [LOOKUP]: refuse(401, raw("unauthorized")) });
      const broke = fakeContext({ [LOOKUP]: refuse(402, raw("credits-depleted")) });
      const forbidden = fakeContext({ [LOOKUP]: refuse(403, raw("client-forbidden")) });

      // When
      const errors = await Promise.all([revoked, broke, forbidden].map((ctx) => errorOf(xConnector.fetch(request(["followers"]), ctx))));

      // Then
      expect(errors.every((e) => e instanceof ConnectorError)).toBe(true);
      expect(errors.some((e) => e?.message.includes(TOKEN.slice(-4)))).toBe(false);
    });

    test("given a rate limit, a usage cap or an outage, when fetched, then the error passes through untouched", async () => {
      // Given
      const limited = new HttpError(429, url("xdevelopers"), '{"title":"Too Many Requests","type":"about:blank","status":429}');
      const capped = new HttpError(403, url("xdevelopers"), '{"title":"Usage Capped","type":"https://api.x.com/2/problems/usage-capped"}');
      const outage = new HttpError(503, url("xdevelopers"), "");
      const throwing = (error: Error) => () => {
        throw error;
      };

      // When
      const errors = await Promise.all([limited, capped, outage].map((e) => errorOf(xConnector.fetch(request(["followers"]), fakeContext({ [LOOKUP]: throwing(e) })))));

      // Then
      expect(errors).toEqual([limited, capped, outage]);
    });

    test("given a connection without a token or handle, when fetched, then nothing is requested", async () => {
      // Given
      const ctx = fakeContext({});

      // When
      const values = await xConnector.fetch({ metrics: ["followers"], params: {}, secret: null, public: null }, ctx);

      // Then
      expect(values).toEqual({});
      expect(ctx.calls).toEqual([]);
    });
  });
});

describe("x-credits connector", () => {
  const SERVER_TOKEN = "AAAAAAAAAAAAAAAAAAAAAFlexwallServerToken";
  const env = { X_BEARER_TOKEN: SERVER_TOKEN };

  test("given the definition, when read, then it costs a credit a day, refreshes every 6 hours and shares the X metrics", () => {
    // Given / When
    const c = xCreditsConnector;

    // Then
    expect(c.creditsPerDay).toBe(1);
    expect(c.ttl).toBe(6 * 3600);
    expect(c.verified).toBe(false);
    expect(c.metrics.map((m) => m.id)).toEqual(ALL);
    expect(c.auth!.fields.map((f) => f.key)).toEqual(["handle"]);
  });

  test("given a handle, when connected, then nothing is read from X and the handle is stored normalised", async () => {
    // Given
    const ctx = fakeContext({}, { env });

    // When
    const result = await xCreditsConnector.connect!({ handle: "@XDevelopers" }, ctx);

    // Then
    expect(ctx.calls).toEqual([]);
    expect(result).toMatchObject({ secret: {}, public: { handle: "xdevelopers" }, label: "@xdevelopers" });
  });

  test("given a stored handle, when fetched, then the lookup uses Flexwall's token and answers every metric", async () => {
    // Given
    let authorization = "";
    const ctx = fakeContext(
      {
        [LOOKUP]: (init: GuardedFetchInit | undefined) => {
          authorization = String((init?.headers as Record<string, string>)?.Authorization);
          return fixture("user");
        },
      },
      { env }
    );

    // When
    const values = await xCreditsConnector.fetch({ metrics: ALL, params: {}, secret: {}, public: { handle: "xdevelopers" } }, ctx);

    // Then
    expect(authorization).toBe(`Bearer ${SERVER_TOKEN}`);
    expect(ctx.calls).toEqual([url("xdevelopers")]);
    expect(Object.keys(values).sort()).toEqual([...ALL].sort());
  });

  test("given Flexwall's X account out of credits, when fetched, then the owner reads nothing about Flexwall's key", async () => {
    // Given
    const ctx = fakeContext({ [LOOKUP]: refuse(402, raw("credits-depleted")) }, { env });

    // When
    const error = await errorOf(xCreditsConnector.fetch({ metrics: ALL, params: {}, secret: {}, public: { handle: "xdevelopers" } }, ctx));

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error!.message).toBe("X is unavailable on Flexwall right now. Your credits aren't spent while it lasts.");
  });

  test("given a server without an X token, when connecting, then the owner is told the server has no X app", async () => {
    // Given
    const ctx = fakeContext({});

    // When
    const error = await errorOf(xCreditsConnector.connect!({ handle: "jack" }, ctx));

    // Then
    expect(error!.message).toBe("This Flexwall server has no X app.");
  });
});
