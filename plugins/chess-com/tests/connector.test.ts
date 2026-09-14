import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import chessCom, { chessComConnector } from "../src/index";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** Hikaru's real stats response, captured from the Published-Data API. */
const stats = JSON.parse(fixture("stats.json"));
const PLAYER = "https://api.chess.com/pub/player/";
const ALL = ["rating-rapid", "rating-blitz", "rating-bullet", "best-rating", "games"];
const request = (metrics: string[], username: string) => ({ metrics, params: { username }, secret: null, public: null });
const usernameField = chessComConnector.metrics[0].params!;

describe("chess-com plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([chessCom]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for every metric of one player, when fetched, then one stats request answers them all", async () => {
    // Given
    const ctx = fakeContext({ [`${PLAYER}hikaru/stats`]: stats });
    const keys = ALL.map((metric) => chessComConnector.cacheKey!({ metric, params: { username: "hikaru" } }));

    // When
    const values = await chessComConnector.fetch(request(ALL, "hikaru"), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([`${PLAYER}hikaru/stats`]);
    expect(values["rating-rapid"]).toEqual(number(stats.chess_rapid.last.rating, { unit: "count" }));
    expect(values["rating-blitz"]).toEqual(number(stats.chess_blitz.last.rating, { unit: "count" }));
    expect(values["rating-bullet"]).toEqual(number(stats.chess_bullet.last.rating, { unit: "count" }));
  });

  test("given the real stats, when the best rating and games are computed, then tactics and Puzzle Rush are ignored and every record counts", async () => {
    // Given
    const ctx = fakeContext({ [`${PLAYER}hikaru/stats`]: stats });
    const standardBests = [stats.chess_rapid, stats.chess_blitz, stats.chess_bullet, stats.chess_daily].map((s) => s.best.rating);
    const records = [stats.chess_rapid, stats.chess_blitz, stats.chess_bullet, stats.chess_daily, stats.chess960_daily].map((s) => s.record);

    // When
    const values = await chessComConnector.fetch(request(["best-rating", "games"], "hikaru"), ctx);

    // Then
    expect(values["best-rating"]).toEqual(number(Math.max(...standardBests), { unit: "count" }));
    expect(values.games).toEqual(number(records.reduce((sum, r) => sum + r.win + r.loss + r.draw, 0), { unit: "count" }));
  });

  test("given a player who never played bullet or daily, when fetched, then those ratings are null and games still count", async () => {
    // Given
    const ctx = fakeContext({
      [`${PLAYER}newcomer/stats`]: {
        chess_rapid: { last: { rating: 812, date: 1789000000, rd: 120 }, best: { rating: 840, date: 1788000000, game: "" }, record: { win: 3, loss: 4, draw: 1 } },
        tactics: { highest: { rating: 2400, date: 1788000000 }, lowest: { rating: 400, date: 1788000000 } },
        fide: 0,
      },
    });

    // When
    const values = await chessComConnector.fetch(request(ALL, "newcomer"), ctx);

    // Then
    expect(values["rating-rapid"]).toEqual(number(812, { unit: "count" }));
    expect(values["rating-blitz"]).toBeNull();
    expect(values["rating-bullet"]).toBeNull();
    expect(values["best-rating"]).toEqual(number(840, { unit: "count" }));
    expect(values.games).toEqual(number(8, { unit: "count" }));
  });

  test("given a player with no rated games at all, when fetched, then ratings are null and games is zero", async () => {
    // Given
    const ctx = fakeContext({ [`${PLAYER}quiet/stats`]: { fide: 0 } });

    // When
    const values = await chessComConnector.fetch(request(ALL, "quiet"), ctx);

    // Then
    expect(values["rating-rapid"]).toBeNull();
    expect(values["best-rating"]).toBeNull();
    expect(values.games).toEqual(number(0, { unit: "count" }));
  });

  test("given a username typed with capitals, when validated and fetched, then the lowercase address is requested and the group is shared", async () => {
    // Given
    const ctx = fakeContext({ [`${PLAYER}hikaru/stats`]: stats });
    const { values: params, error } = validateFields(usernameField, { username: " Hikaru " });

    // When
    const values = await chessComConnector.fetch(request(["rating-blitz"], String(params.username)), ctx);

    // Then
    expect(error).toBeNull();
    expect(ctx.calls).toEqual([`${PLAYER}hikaru/stats`]);
    expect(chessComConnector.cacheKey!({ metric: "games", params })).toBe(chessComConnector.cacheKey!({ metric: "rating-rapid", params: { username: "hikaru" } }));
    expect(values["rating-blitz"]?.type).toBe("number");
  });

  test("given a username with a space, when validated, then the form refuses it", () => {
    // Given
    const typed = { username: "magnus carlsen" };

    // When
    const { error } = validateFields(usernameField, typed);

    // Then
    expect(error).toBe("Chess.com username can only use letters, digits, dashes and underscores.");
  });

  test("given a player Chess.com doesn't know, when fetched, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({
      [PLAYER]: (_init, url) => {
        throw new HttpError(404, url, fixture("not-found.json"));
      },
    });

    // When
    const attempt = chessComConnector.fetch(request(ALL, "nobody-zzqx-12345"), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("Chess.com has no player called nobody-zzqx-12345.");
  });

  test("given a player whose data is gone for good, when fetched, then the 410 becomes a sentence", async () => {
    // Given
    const ctx = fakeContext({
      [PLAYER]: (_init, url) => {
        throw new HttpError(410, url, "");
      },
    });

    // When
    const attempt = chessComConnector.fetch(request(ALL, "closed-account"), ctx);

    // Then
    await expect(attempt).rejects.toThrow("Chess.com no longer publishes data for closed-account.");
  });

  test("given Chess.com is throttling, when fetched, then the 429 goes through untouched for the host to handle", async () => {
    // Given
    const throttled = new HttpError(429, `${PLAYER}hikaru/stats`, "");
    const ctx = fakeContext({
      [PLAYER]: () => {
        throw throttled;
      },
    });

    // When
    const attempt = chessComConnector.fetch(request(ALL, "hikaru"), ctx);

    // Then
    await expect(attempt).rejects.toBe(throttled);
  });
});
