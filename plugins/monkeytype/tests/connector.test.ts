import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import monkeytype, { bestWpm, monkeytypeConnector, type PersonalBest } from "../src/index";

const KEY = "NjhmMGE5YjJjM2Q0ZTVmNjA3MTgyOTNhLmQ0YjVjNmU3ZjgwOTFhMmIzYzRkNWU2Zjc4OTBhMWIy";
const API = "https://api.monkeytype.com";
const BESTS = `${API}/users/personalBests?mode=time`;
const STATS = `${API}/users/stats`;
const ALL = ["wpm-60s", "wpm-15s", "tests-completed", "time-typing"];
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY }, public: { hint: "…MWIy" } });

const best = (wpm: number, extra: Partial<PersonalBest> = {}): PersonalBest => ({
  acc: 97.5,
  consistency: 81.2,
  difficulty: "normal",
  language: "english",
  punctuation: false,
  numbers: false,
  lazyMode: false,
  raw: wpm + 4,
  wpm,
  timestamp: 1788000000000,
  ...extra,
} as PersonalBest);

/** Time-mode bests as the server stores them: an array per test length. Built from the documented PersonalBest schema. */
const bests = {
  message: "Personal bests retrieved",
  data: {
    "15": [best(128.4), best(119.9, { punctuation: true })],
    "30": [best(115)],
    "60": [best(104.2), best(111.6, { language: "english_1k" }), best(92, { punctuation: true, numbers: true })],
    "120": [],
  },
};
const stats = { message: "Personal stats retrieved", data: { completedTests: 2318, startedTests: 3120, timeTyping: 347400.73 } };

const monkeyError = (status: number, message: string) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify({ message, data: { uid: "" } }));
};

describe("monkeytype plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([monkeytype]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for every metric, when fetched, then one bests request and one stats request answer them all with the ApeKey", async () => {
    // Given
    const headers: string[] = [];
    const seen = (body: unknown) => (init?: GuardedFetchInit) => (headers.push(init?.headers?.Authorization ?? ""), body);
    const ctx = fakeContext({ [BESTS]: seen(bests), [STATS]: seen(stats) });
    const keys = ALL.map((metric) => monkeytypeConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await monkeytypeConnector.fetch(request(ALL), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([BESTS, STATS]);
    expect(headers).toEqual([`ApeKey ${KEY}`, `ApeKey ${KEY}`]);
    expect(values["wpm-60s"]).toEqual(number(111.6, { unit: "count" }));
    expect(values["wpm-15s"]).toEqual(number(128.4, { unit: "count" }));
    expect(values["tests-completed"]).toEqual(number(2318, { unit: "count" }));
    expect(values["time-typing"]).toEqual(number(96.5, { unit: "count" }));
  });

  test("given only a WPM tile, when fetched, then the stats request isn't made", async () => {
    // Given
    const ctx = fakeContext({ [BESTS]: bests });

    // When
    const values = await monkeytypeConnector.fetch(request(["wpm-60s"]), ctx);

    // Then
    expect(ctx.calls).toEqual([BESTS]);
    expect(values["wpm-60s"]?.type).toBe("number");
  });

  test("given bests missing, empty, as a single object or null, when read, then each gives a number or null", () => {
    // Given
    const shapes = [{ "60": [] }, { "30": [best(90)] }, { "60": best(88.5) }, null, { "60": [{ wpm: "fast" } as unknown as PersonalBest] }];

    // When
    const values = shapes.map((data) => bestWpm(data, "60"));

    // Then
    expect(values).toEqual([null, null, number(88.5, { unit: "count" }), null, null]);
  });

  test("given a new account with no bests and empty stats, when fetched, then bests are null and counts are zero", async () => {
    // Given
    const ctx = fakeContext({ [BESTS]: { message: "Personal bests retrieved", data: null }, [STATS]: { message: "Personal stats retrieved", data: {} } });

    // When
    const values = await monkeytypeConnector.fetch(request(ALL), ctx);

    // Then
    expect(values["wpm-60s"]).toBeNull();
    expect(values["wpm-15s"]).toBeNull();
    expect(values["tests-completed"]).toEqual(number(0, { unit: "count" }));
    expect(values["time-typing"]).toEqual(number(0, { unit: "count" }));
  });

  test("given stats answered with null data, when fetched, then the stats are null", async () => {
    // Given
    const ctx = fakeContext({ [STATS]: { message: "Personal stats retrieved", data: null } });

    // When
    const values = await monkeytypeConnector.fetch(request(["tests-completed", "time-typing"]), ctx);

    // Then
    expect(values).toEqual({ "tests-completed": null, "time-typing": null });
  });

  test("given a working ApeKey, when connecting, then one stats call proves it and only a hint is shown", async () => {
    // Given
    const ctx = fakeContext({ [STATS]: stats });
    const input = validateFields(monkeytypeConnector.auth!.fields, { key: ` ${KEY} ` }).values;

    // When
    const result = await monkeytypeConnector.connect!(input, ctx);

    // Then
    expect(ctx.calls).toEqual([STATS]);
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "…MWIy" });
    expect(result.label).toBe("Monkeytype (key …MWIy)");
    expect(result.accountId).toBeUndefined();
    expect(JSON.stringify([result.public, result.label])).not.toContain(KEY);
  });

  test("given an ApeKey that hasn't been switched on, when connecting, then the owner is told to activate it", async () => {
    // Given
    const ctx = fakeContext({ [STATS]: monkeyError(471, "ApeKey is inactive") });

    // When
    const error = await monkeytypeConnector.connect!({ key: KEY }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("isn't active yet");
    expect((error as Error).message).not.toContain(KEY);
  });

  test("given invalid, malformed, deleted or missing keys, when connecting, then each is refused with a sentence that never contains the key", async () => {
    // Given
    const answers = [
      monkeyError(470, "Invalid ApeKey"),
      monkeyError(472, "ApeKey is malformed"),
      monkeyError(400, "Malformed ApeKey"),
      monkeyError(404, "ApeKey not found"),
      monkeyError(401, "Unauthorized"),
    ];

    // When
    const errors = await Promise.all(answers.map((answer) => monkeytypeConnector.connect!({ key: KEY }, fakeContext({ [STATS]: answer })).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("Monkeytype refused this ApeKey, so check that it's copied whole and hasn't been deleted.");
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  test("given a key deleted after connecting, when fetched, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({ [BESTS]: monkeyError(404, "ApeKey not found") });

    // When
    const error = await monkeytypeConnector.fetch(request(["wpm-60s"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).not.toContain(KEY);
  });

  test("given rate limits or ApeKeys paused server-side, when fetched, then the errors go through for the host to handle", async () => {
    // Given
    const answers = [monkeyError(479, "ApeKey rate limit exceeded"), monkeyError(429, "Request limit reached, please try again later."), monkeyError(503, "ApeKeys are not being accepted at this time")];

    // When
    const errors = await Promise.all(answers.map((answer) => monkeytypeConnector.fetch(request(ALL), fakeContext({ [BESTS]: answer })).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).not.toBeInstanceOf(ConnectorError);
    }
  });
});
