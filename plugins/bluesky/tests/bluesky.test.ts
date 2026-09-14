import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import bluesky, { blueskyConnector } from "../src/index";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const profile = JSON.parse(fixture("profile.json"));
const PROFILE = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=";
const request = (metrics: string[], params: Record<string, string>) => ({ metrics, params, secret: null, public: null });
const handleField = blueskyConnector.metrics[0].params!;

describe("bluesky plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([bluesky]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for followers, following and posts of one handle, when fetched, then one request answers all three", async () => {
    // Given
    const ctx = fakeContext({ [`${PROFILE}jay.bsky.team`]: profile });
    const keys = ["followers", "following", "posts"].map((metric) => blueskyConnector.cacheKey!({ metric, params: { handle: "jay.bsky.team" } }));

    // When
    const values = await blueskyConnector.fetch(request(["followers", "following", "posts"], { handle: "jay.bsky.team" }), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toHaveLength(1);
    expect(values.followers).toEqual(number(profile.followersCount, { unit: "count" }));
    expect(values.following).toEqual(number(profile.followsCount, { unit: "count" }));
    expect(values.posts).toEqual(number(profile.postsCount, { unit: "count" }));
  });

  test("given a handle typed with a leading @ and capitals, when validated and fetched, then it's accepted and shares the plain handle's group", async () => {
    // Given
    const ctx = fakeContext({ [`${PROFILE}jay.bsky.team`]: profile });
    const typed = { handle: " @Jay.bsky.team " };

    // When
    const { values: params, error } = validateFields(handleField, typed);
    const values = await blueskyConnector.fetch(request(["followers"], params as Record<string, string>), ctx);

    // Then
    expect(error).toBeNull();
    expect(blueskyConnector.cacheKey!({ metric: "followers", params })).toBe(blueskyConnector.cacheKey!({ metric: "posts", params: { handle: "jay.bsky.team" } }));
    expect(ctx.calls).toEqual([`${PROFILE}jay.bsky.team`]);
    expect(values.followers?.type).toBe("number");
  });

  test("given a name without a domain, when validated, then the owner is told to type the full handle", () => {
    // Given
    const typed = { handle: "jay" };

    // When
    const { error } = validateFields(handleField, typed);

    // Then
    expect(error).toBe("Bluesky handle must be a full handle, like jay.bsky.team.");
  });

  test("given a handle Bluesky doesn't know, when fetched, then the owner gets a sentence, not a stack trace", async () => {
    // Given
    const ctx = fakeContext({
      [PROFILE]: () => {
        throw new HttpError(400, `${PROFILE}nobody.bsky.social`, fixture("not-found.json"));
      },
    });

    // When
    const attempt = blueskyConnector.fetch(request(["followers"], { handle: "nobody.bsky.social" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("Bluesky has no profile called @nobody.bsky.social.");
  });

  test("given a deactivated account, when fetched, then the sentence says so", async () => {
    // Given
    const ctx = fakeContext({
      [PROFILE]: () => {
        throw new HttpError(400, `${PROFILE}gone.bsky.social`, JSON.stringify({ error: "AccountDeactivated", message: "Account is deactivated" }));
      },
    });

    // When
    const attempt = blueskyConnector.fetch(request(["followers"], { handle: "gone.bsky.social" }), ctx);

    // Then
    await expect(attempt).rejects.toThrow("The Bluesky account @gone.bsky.social is deactivated.");
  });

  test("given a Bluesky outage, when fetched, then the error goes through untouched for the host to handle", async () => {
    // Given
    const outage = new HttpError(502, `${PROFILE}jay.bsky.team`, "");
    const ctx = fakeContext({
      [PROFILE]: () => {
        throw outage;
      },
    });

    // When
    const attempt = blueskyConnector.fetch(request(["followers"], { handle: "jay.bsky.team" }), ctx);

    // Then
    await expect(attempt).rejects.toBe(outage);
  });
});
