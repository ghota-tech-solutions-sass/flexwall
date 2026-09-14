import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import lichess, { establishedRating, hours, lichessConnector } from "../src/index";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** thibault's real public profile, captured from the API. Classical is provisional in it. */
const user = JSON.parse(fixture("user.json"));
const USER = "https://lichess.org/api/user/";
const ALL = ["rating-bullet", "rating-blitz", "rating-rapid", "rating-classical", "games", "play-time"];
const request = (metrics: string[], username: string) => ({ metrics, params: { username }, secret: null, public: null });
const usernameField = lichessConnector.metrics[0].params!;

describe("lichess plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([lichess]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for every metric of one user, when fetched, then one request answers them all", async () => {
    // Given
    const ctx = fakeContext({ [`${USER}thibault`]: user });
    const keys = ALL.map((metric) => lichessConnector.cacheKey!({ metric, params: { username: "thibault" } }));

    // When
    const values = await lichessConnector.fetch(request(ALL, "thibault"), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([`${USER}thibault`]);
    expect(values["rating-bullet"]).toEqual(number(user.perfs.bullet.rating, { unit: "count" }));
    expect(values["rating-blitz"]).toEqual(number(user.perfs.blitz.rating, { unit: "count" }));
    expect(values["rating-rapid"]).toEqual(number(user.perfs.rapid.rating, { unit: "count" }));
    expect(values.games).toEqual(number(user.count.all, { unit: "count" }));
    expect(values["play-time"]).toEqual(number(Math.round(user.playTime.total / 360) / 10, { unit: "count" }));
  });

  test("given a provisional classical rating in the real profile, when fetched, then classical is null", async () => {
    // Given
    const ctx = fakeContext({ [`${USER}thibault`]: user });

    // When
    const values = await lichessConnector.fetch(request(["rating-classical"], "thibault"), ctx);

    // Then
    expect(user.perfs.classical.prov).toBe(true);
    expect(values["rating-classical"]).toBeNull();
  });

  test("given pools that are unplayed, provisional, missing or settled, when rated, then only the settled one shows", () => {
    // Given
    const unplayed = { games: 0, rating: 1500, rd: 500, prog: 0, prov: true };
    const provisional = { games: 12, rating: 1349, rd: 313, prog: 0, prov: true };
    const settled = { games: 914, rating: 1789, rd: 69, prog: -100 };

    // When
    const ratings = [unplayed, provisional, undefined, settled].map(establishedRating);

    // Then
    expect(ratings).toEqual([null, null, null, number(1789, { unit: "count" })]);
  });

  test("given seconds of play, when turned into hours, then one decimal is kept", () => {
    // Given
    const seconds = [0, 2819, 6602756];

    // When
    const values = seconds.map(hours);

    // Then
    expect(values.map((v) => v.value)).toEqual([0, 0.8, 1834.1]);
  });

  test("given a username typed with capitals, when validated and fetched, then it shares the lowercase group", async () => {
    // Given
    const ctx = fakeContext({ [`${USER}thibault`]: user });
    const { values: params, error } = validateFields(usernameField, { username: " Thibault " });

    // When
    const values = await lichessConnector.fetch(request(["games"], String(params.username)), ctx);

    // Then
    expect(error).toBeNull();
    expect(ctx.calls).toEqual([`${USER}thibault`]);
    expect(lichessConnector.cacheKey!({ metric: "games", params })).toBe(lichessConnector.cacheKey!({ metric: "play-time", params: { username: "thibault" } }));
    expect(values.games?.type).toBe("number");
  });

  test("given a user Lichess doesn't know, when fetched, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({
      [USER]: (_init, url) => {
        throw new HttpError(404, url, fixture("not-found.json"));
      },
    });

    // When
    const attempt = lichessConnector.fetch(request(ALL, "nobody-zzqx-12345"), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("Lichess has no user called nobody-zzqx-12345.");
  });

  test("given a closed account, when fetched, then the real 200 answer becomes a sentence", async () => {
    // Given
    const ctx = fakeContext({ [`${USER}test1`]: JSON.parse(fixture("closed.json")) });

    // When
    const attempt = lichessConnector.fetch(request(ALL, "test1"), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("The Lichess account test1 is closed.");
  });

  test("given Lichess is rate limiting, when fetched, then the 429 goes through untouched", async () => {
    // Given
    const limited = new HttpError(429, `${USER}thibault`, "");
    const ctx = fakeContext({
      [USER]: () => {
        throw limited;
      },
    });

    // When
    const attempt = lichessConnector.fetch(request(ALL, "thibault"), ctx);

    // Then
    await expect(attempt).rejects.toBe(limited);
  });
});
