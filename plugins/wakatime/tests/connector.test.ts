import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BlockedRequestError, checkPlugins, ConnectorError, HttpError, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import wakatime, { codingDays, currentStreak, lastSevenDays, levelFor, wakatimeConnector, type CodingDay } from "../src/index";

/** 30 days of summaries ending 2026-09-14, in the shape WakaTime documents. Nothing coded yet on the 14th, a gap on the 6th. */
const summaries = JSON.parse(readFileSync(new URL("./fixtures/summaries.json", import.meta.url), "utf8"));
const KEY = "waka_0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const TODAY = "2026-09-14";
const API = "https://wakatime.com/api/v1/users/current";
const SUMMARIES_30 = `${API}/summaries?start=2026-08-16&end=2026-09-14`;
const SUMMARIES_7 = `${API}/summaries?start=2026-09-08&end=2026-09-14`;
const ALL_TIME = `${API}/all_time_since_today`;
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY }, public: { hint: "…e1f0", account: "@ada" } });
const days = (active: Record<string, number>): CodingDay[] => Object.entries(active).map(([date, seconds]) => ({ date, seconds }));

const refuse = (status: number, body = JSON.stringify({ errors: ["Unauthorized."] })) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, body);
};

describe("wakatime plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([wakatime]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for the 7-day numbers, activity and streak, when fetched, then one summaries request with the key answers them all", async () => {
    // Given
    let authorization = "";
    const ctx = fakeContext({ [`${API}/summaries`]: (init?: GuardedFetchInit) => ((authorization = init?.headers?.Authorization ?? ""), summaries) }, { today: TODAY });
    const metrics = ["coding-7d", "daily-average-7d", "activity", "streak"];
    const keys = metrics.map((metric) => wakatimeConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await wakatimeConnector.fetch(request(metrics), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([SUMMARIES_30]);
    expect(authorization).toBe(`Basic ${btoa(KEY)}`);
    expect(values["coding-7d"]).toEqual(number(13.2, { unit: "count" }));
    expect(values["daily-average-7d"]).toEqual(number(2.2, { unit: "count" }));
    expect(values.streak).toEqual(number(7, { unit: "count" }));
    expect(values.activity?.type).toBe("calendar");
  });

  test("given the documented key example, when the header is built, then it's the key alone in base64", async () => {
    // Given
    let authorization = "";
    const ctx = fakeContext({ [ALL_TIME]: (init?: GuardedFetchInit) => ((authorization = init?.headers?.Authorization ?? ""), { data: { total_seconds: 0, is_up_to_date: true, percent_calculated: 100 } }) });

    // When
    await wakatimeConnector.fetch({ metrics: ["all-time"], params: {}, secret: { key: "12345" }, public: {} }, ctx);

    // Then
    expect(authorization).toBe("Basic MTIzNDU=");
  });

  test("given the summaries, when the activity graph is built, then every day comes back oldest first in hours with levels", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/summaries`]: summaries }, { today: TODAY });

    // When
    const values = await wakatimeConnector.fetch(request(["activity"]), ctx);

    // Then
    const graph = values.activity as { days: { date: string; count: number; level: number }[] };
    expect(graph.days).toHaveLength(30);
    expect(graph.days[0]).toEqual({ date: "2026-08-16", count: 2, level: 3 });
    expect(graph.days.at(-2)).toEqual({ date: "2026-09-13", count: 0.2, level: 1 });
    expect(graph.days.at(-1)).toEqual({ date: "2026-09-14", count: 0, level: 0 });
  });

  test("given nothing coded yet today, when the streak is computed, then yesterday still counts; tomorrow it's broken", () => {
    // Given
    const history = days({ "2026-09-12": 1800, "2026-09-13": 3600, "2026-09-14": 0 });

    // When
    const today = currentStreak(history, "2026-09-14");
    const tomorrow = currentStreak(history, "2026-09-15");

    // Then
    expect(today).toBe(2);
    expect(tomorrow).toBe(0);
  });

  test("given coding today and a gap three days ago, when the streak is computed, then it stops at the gap", () => {
    // Given
    const history = days({ "2026-09-10": 7200, "2026-09-11": 0, "2026-09-12": 600, "2026-09-13": 60, "2026-09-14": 1 });

    // When
    const streak = currentStreak(history, "2026-09-14");

    // Then
    expect(streak).toBe(3);
  });

  test("given no coding in the window or no days at all, when the streak is computed, then it's zero", () => {
    // Given
    const idle = days({ "2026-09-13": 0, "2026-09-14": 0 });

    // When
    const streaks = [currentStreak(idle, TODAY), currentStreak([], TODAY)];

    // Then
    expect(streaks).toEqual([0, 0]);
  });

  test("given a week with idle days, when the 7-day numbers are computed, then the average skips idle days and older days are left out", () => {
    // Given
    const history = days({ "2026-09-07": 36000, "2026-09-08": 3600, "2026-09-10": 7200, "2026-09-14": 0 });

    // When
    const week = lastSevenDays(history, TODAY);
    const empty = lastSevenDays([], TODAY);

    // Then
    expect(week).toEqual({ total: 10800, average: 5400 });
    expect(empty).toEqual({ total: 0, average: 0 });
  });

  test("given a response with a day after today, a duplicate date and no range, when parsed, then only real past days remain", () => {
    // Given
    const response = {
      data: [
        { grand_total: { total_seconds: 60 }, range: { date: "2026-09-15" } },
        { grand_total: { total_seconds: 30 }, range: { date: "2026-09-13" } },
        { grand_total: { total_seconds: 30 }, range: { date: "2026-09-13" } },
        { grand_total: { total_seconds: 10 } },
        { range: { date: "2026-09-12" } },
      ],
    };

    // When
    const parsed = codingDays(response, TODAY);

    // Then
    expect(parsed).toEqual([
      { date: "2026-09-12", seconds: 0 },
      { date: "2026-09-13", seconds: 60 },
    ]);
  });

  test("given coding times, when levels are picked, then they follow the hour thresholds", () => {
    // Given
    const seconds = [0, 1, 3599, 3600, 7200, 14399, 14400];

    // When
    const levels = seconds.map(levelFor);

    // Then
    expect(levels).toEqual([0, 1, 1, 2, 3, 3, 4]);
  });

  test("given a plan that refuses 30 days of history, when fetched, then the last 7 days are asked for instead", async () => {
    // Given
    const week = { data: summaries.data.slice(-7) };
    const ctx = fakeContext({ [SUMMARIES_30]: refuse(402, JSON.stringify({ error: "Payment Required" })), [SUMMARIES_7]: week }, { today: TODAY });

    // When
    const values = await wakatimeConnector.fetch(request(["streak", "activity", "coding-7d"]), ctx);

    // Then
    expect(ctx.calls).toEqual([SUMMARIES_30, SUMMARIES_7]);
    expect(values.streak).toEqual(number(6, { unit: "count" }));
    expect(values["coding-7d"]).toEqual(number(13.2, { unit: "count" }));
    expect((values.activity as { days: unknown[] }).days).toHaveLength(7);
  });

  test("given all-time stats that are ready, when fetched, then only the all-time request is made", async () => {
    // Given
    const ctx = fakeContext({ [ALL_TIME]: { data: { total_seconds: 6636600.5, is_up_to_date: true, percent_calculated: 100, text: "1,843 hrs 30 mins" } } });

    // When
    const values = await wakatimeConnector.fetch(request(["all-time"]), ctx);

    // Then
    expect(wakatimeConnector.cacheKey!({ metric: "all-time", params: {} })).not.toBe(wakatimeConnector.cacheKey!({ metric: "streak", params: {} }));
    expect(ctx.calls).toEqual([ALL_TIME]);
    expect(values).toEqual({ "all-time": number(1843.5, { unit: "count" }) });
  });

  test("given all-time stats still being calculated, when fetched, then the value is null rather than a partial total", async () => {
    // Given
    const calculating = fakeContext({ [ALL_TIME]: { data: { total_seconds: 0, is_up_to_date: false, percent_calculated: 40 } } });
    const refreshing = fakeContext({ [ALL_TIME]: { data: { total_seconds: 7200, is_up_to_date: false, percent_calculated: 100 } } });

    // When
    const values = await Promise.all([wakatimeConnector.fetch(request(["all-time"]), calculating), wakatimeConnector.fetch(request(["all-time"]), refreshing)]);

    // Then
    expect(values[0]["all-time"]).toBeNull();
    expect(values[1]["all-time"]).toEqual(number(2, { unit: "count" }));
  });

  test("given a good key, when connecting, then the account is named, identified, and only a hint of the key is shown", async () => {
    // Given
    let authorization = "";
    const ctx = fakeContext({ [API]: (init?: GuardedFetchInit) => ((authorization = init?.headers?.Authorization ?? ""), { data: { id: "b1c2-uuid", username: "ada", display_name: "Ada Lovelace", plan: "free" } }) });
    const input = validateFields(wakatimeConnector.auth!.fields, { key: ` ${KEY} ` }).values;

    // When
    const result = await wakatimeConnector.connect!(input, ctx);

    // Then
    expect(authorization).toBe(`Basic ${btoa(KEY)}`);
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "…e1f0", account: "@ada" });
    expect(result.label).toBe("WakaTime (@ada)");
    expect(result.accountId).toBe("b1c2-uuid");
    expect(JSON.stringify([result.public, result.label, result.accountId])).not.toContain(KEY);
    expect(JSON.stringify([result.public, result.label])).not.toContain(btoa(KEY));
  });

  test("given an account without a username, when connecting, then the display name labels it", async () => {
    // Given
    const ctx = fakeContext({ [API]: { data: { id: "b1c2-uuid", username: null, display_name: "Anonymous User" } } });

    // When
    const result = await wakatimeConnector.connect!({ key: KEY }, ctx);

    // Then
    expect(result.label).toBe("WakaTime (Anonymous User)");
  });

  test("given a wrong key, when connecting, then the owner gets a sentence that never contains the key", async () => {
    // Given
    const ctx = fakeContext({ [API]: refuse(401) });

    // When
    const error = await wakatimeConnector.connect!({ key: KEY }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("WakaTime refused this API key.");
    expect((error as Error).message).not.toContain(KEY);
  });

  test("given a key regenerated after connecting, when fetched, then the owner is told to connect again, without the key", async () => {
    // Given
    const ctx = fakeContext({ [API]: refuse(401) }, { today: TODAY });

    // When
    const errors = await Promise.all([
      wakatimeConnector.fetch(request(["streak"]), ctx).catch((e: unknown) => e),
      wakatimeConnector.fetch(request(["all-time"]), ctx).catch((e: unknown) => e),
    ]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("connect WakaTime again");
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  test("given WakaTime rate limits with a 429 or a redirect, when fetched, then the errors go through for the host to handle", async () => {
    // Given
    const limited = fakeContext({ [API]: refuse(429, "") }, { today: TODAY });
    const redirected = fakeContext({
      [API]: () => {
        throw new BlockedRequestError("answered with a redirect", "redirect");
      },
    }, { today: TODAY });

    // When
    const errors = await Promise.all([
      wakatimeConnector.fetch(request(["coding-7d"]), limited).catch((e: unknown) => e),
      wakatimeConnector.fetch(request(["coding-7d"]), redirected).catch((e: unknown) => e),
    ]);

    // Then
    expect(errors[0]).toBeInstanceOf(HttpError);
    expect(errors[1]).toBeInstanceOf(BlockedRequestError);
    expect(errors.some((e) => e instanceof ConnectorError)).toBe(false);
  });
});
