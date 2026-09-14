import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import hackernews, { hackernewsConnector, MAX_BYTES } from "../src/index";

const user = JSON.parse(readFileSync(new URL("./fixtures/user.json", import.meta.url), "utf8"));
const USERS = "https://hacker-news.firebaseio.com/v0/user/";
const request = (metrics: string[], params: Record<string, string>) => ({ metrics, params, secret: null, public: null });

describe("hackernews plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([hackernews]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for karma and submissions of one user, when fetched, then one request answers both", async () => {
    // Given
    const ctx = fakeContext({ [`${USERS}jl.json`]: user });
    const keys = ["karma", "submissions"].map((metric) => hackernewsConnector.cacheKey!({ metric, params: { user: "jl" } }));

    // When
    const values = await hackernewsConnector.fetch(request(["karma", "submissions"], { user: "jl" }), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([`${USERS}jl.json`]);
    expect(values.karma).toEqual(number(user.karma, { unit: "count" }));
    expect(values.submissions).toEqual(number(user.submitted.length, { unit: "count" }));
  });

  test("given a prolific user, when fetched, then the request allows the host's maximum size", async () => {
    // Given
    let init: GuardedFetchInit | undefined;
    const ctx = fakeContext({ [`${USERS}dang.json`]: (i?: GuardedFetchInit) => ((init = i), { id: "dang", karma: 1, submitted: Array.from({ length: 90_000 }, (_, n) => n) }) });

    // When
    const values = await hackernewsConnector.fetch(request(["submissions"], { user: "dang" }), ctx);

    // Then
    expect(init?.maxBytes).toBe(MAX_BYTES);
    expect(MAX_BYTES).toBe(4_000_000);
    expect(values.submissions).toEqual(number(90_000, { unit: "count" }));
  });

  test("given a user who never submitted anything, when fetched, then submissions is zero", async () => {
    // Given
    const ctx = fakeContext({ [`${USERS}quiet.json`]: { id: "quiet", karma: 1, created: 1700000000 } });

    // When
    const values = await hackernewsConnector.fetch(request(["karma", "submissions"], { user: "quiet" }), ctx);

    // Then
    expect(values.karma).toEqual(number(1, { unit: "count" }));
    expect(values.submissions).toEqual(number(0, { unit: "count" }));
  });

  test("given a user Hacker News doesn't know, when fetched, then the null answer becomes a sentence", async () => {
    // Given
    const ctx = fakeContext({ [`${USERS}nobody-zzqx.json`]: null });

    // When
    const attempt = hackernewsConnector.fetch(request(["karma"], { user: "nobody-zzqx" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("Hacker News has no user called nobody-zzqx (usernames are case-sensitive).");
  });

  test("given usernames that differ only by case, when grouped, then they stay apart", () => {
    // Given
    const lower = { user: "pg" };
    const upper = { user: "PG" };

    // When
    const keys = [lower, upper].map((params) => hackernewsConnector.cacheKey!({ metric: "karma", params }));

    // Then
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("given a Hacker News outage, when fetched, then the error goes through untouched for the host to handle", async () => {
    // Given
    const outage = new HttpError(503, `${USERS}jl.json`, "");
    const ctx = fakeContext({
      [USERS]: () => {
        throw outage;
      },
    });

    // When
    const attempt = hackernewsConnector.fetch(request(["karma"], { user: "jl" }), ctx);

    // Then
    await expect(attempt).rejects.toBe(outage);
  });
});
