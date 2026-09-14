import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, series, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import paddle, { latest, paddleConnector, toMajor } from "../src/index";

/** The 200 examples of the Metrics endpoints and the forbidden error, from Paddle's OpenAPI description. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const LIVE = "https://api.paddle.com";
const SANDBOX = "https://sandbox-api.paddle.com";
const KEY = "pdl_live_apikey_01gtgztp8f4kek3yd4g1wrksa3_q6TGTJyvoIz7LDtXT65bX7_AQO";
const SANDBOX_KEY = "pdl_sdbx_apikey_01gtgztp8f4kek3yd4g1wrksa3_q6TGTJyvoIz7LDtXT65bX7_AQO";
const RANGE = "?from=2026-08-16&to=2026-09-15";
const request = (metrics: string[], key = KEY) => ({ metrics, params: {}, secret: { key }, public: null });
const routes = (host = LIVE) => ({
  [`${host}/metrics/monthly-recurring-revenue`]: fixture("mrr"),
  [`${host}/metrics/active-subscribers`]: fixture("active-subscribers"),
  [`${host}/metrics/revenue`]: fixture("revenue"),
});
const refuse = (status: number) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify(fixture("forbidden")));
};

describe("paddle plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([paddle]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given Paddle's daily metrics, when every metric is fetched, then gauges take the latest day and revenue sums the 30 days", async () => {
    // Given
    let sent: GuardedFetchInit | undefined;
    const ctx = fakeContext(
      {
        ...routes(),
        [`${LIVE}/metrics/monthly-recurring-revenue`]: (init) => {
          sent = init;
          return fixture("mrr");
        },
      },
      { today: "2026-09-14" }
    );
    const keys = ["mrr", "subscribers", "revenue30d", "revenue-daily"].map((metric) => paddleConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await paddleConnector.fetch(request(["mrr", "subscribers", "revenue30d", "revenue-daily"]), ctx);

    // Then
    expect(values.mrr).toEqual(money(14_209_877, "usd"));
    expect(values.subscribers).toEqual(number(1291, { unit: "count" }));
    expect(values.revenue30d).toEqual(money(54_514_551, "usd"));
    expect(values["revenue-daily"]).toEqual(
      series(
        [
          { t: "2025-09-01", v: 12_860_230.68 },
          { t: "2025-09-02", v: 13_456_789.01 },
          { t: "2025-09-03", v: 13_987_654.32 },
          { t: "2025-09-04", v: 14_209_876.54 },
        ],
        { unit: "currency", currency: "usd" }
      )
    );
    expect(ctx.calls).toEqual([`${LIVE}/metrics/monthly-recurring-revenue${RANGE}`, `${LIVE}/metrics/active-subscribers${RANGE}`, `${LIVE}/metrics/revenue${RANGE}`]);
    expect(sent?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    expect(new Set(keys).size).toBe(1);
  });

  test("given only MRR is needed, when fetched, then the other metrics endpoints aren't called", async () => {
    // Given
    const ctx = fakeContext(routes(), { today: "2026-09-14" });

    // When
    const values = await paddleConnector.fetch(request(["mrr"]), ctx);

    // Then
    expect(Object.keys(values)).toEqual(["mrr"]);
    expect(ctx.calls).toEqual([`${LIVE}/metrics/monthly-recurring-revenue${RANGE}`]);
  });

  test("given a sandbox key, when fetched, then the sandbox host is used", async () => {
    // Given
    const ctx = fakeContext(routes(SANDBOX), { today: "2026-09-14" });

    // When
    await paddleConnector.fetch(request(["subscribers"], SANDBOX_KEY), ctx);

    // Then
    expect(ctx.calls).toEqual([`${SANDBOX}/metrics/active-subscribers${RANGE}`]);
  });

  test("given a new account with empty timeseries, when fetched, then gauges have no value and revenue is zero", async () => {
    // Given
    const empty = (name: string) => {
      const body = fixture(name);
      body.data.timeseries = [];
      return body;
    };
    const ctx = fakeContext({
      [`${LIVE}/metrics/monthly-recurring-revenue`]: empty("mrr"),
      [`${LIVE}/metrics/active-subscribers`]: empty("active-subscribers"),
      [`${LIVE}/metrics/revenue`]: empty("revenue"),
    });

    // When
    const values = await paddleConnector.fetch(request(["mrr", "subscribers", "revenue30d", "revenue-daily"]), ctx);

    // Then
    expect(values.mrr).toBeNull();
    expect(values.subscribers).toBeNull();
    expect(values.revenue30d).toEqual(money(0, "usd"));
    expect(values["revenue-daily"]).toEqual(series([], { unit: "currency", currency: "usd" }));
  });

  test("given amounts in a zero-decimal currency and a last day without a value, when read, then yen stay whole and the last day with a value wins", () => {
    // Given
    const body = fixture("mrr");
    body.data.timeseries.push({ timestamp: "2025-09-05T00:00:00Z" });

    // When
    const minor = latest(body, "amount");

    // Then
    expect(minor).toBe(1_420_987_654);
    expect(toMajor(1500, "JPY")).toBe(1500);
    expect(toMajor(1500, "eur")).toBe(15);
  });

  test("given a valid live key, when connecting, then the connection names the balance currency without the key", async () => {
    // Given
    const ctx = fakeContext(routes(), { today: "2026-09-14" });

    // When
    const result = await paddleConnector.connect!({ key: KEY }, ctx);

    // Then
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "…_AQO", mode: "live", currency: "usd" });
    expect(result.label).toBe("Paddle live (USD)");
    expect(ctx.calls).toEqual([`${LIVE}/metrics/monthly-recurring-revenue${RANGE}`]);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(KEY);
    expect(shown).not.toContain(KEY.slice(16, 50));
  });

  test("given a client-side token or an old-format key, when connecting, then it's refused before any request", async () => {
    // Given
    const ctx = fakeContext({});
    const clientToken = "live_7d279f61a3499fed520f7cd8c08";

    // When
    const attempt = paddleConnector.connect!({ key: clientToken }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("Paddle Billing API key");
    expect(ctx.calls).toEqual([]);
    expect(validateFields(paddleConnector.auth!.fields, { key: clientToken }).error).toContain("pdl_live_apikey_");
    expect(validateFields(paddleConnector.auth!.fields, { key: SANDBOX_KEY }).error).toBeNull();
  });

  test("given a key without metrics.read or a revoked key, when fetched, then the owner gets a sentence that doesn't repeat the key", async () => {
    // Given
    const forbidden = fakeContext({ [`${LIVE}/metrics/`]: refuse(403) });
    const revoked = fakeContext({ [`${LIVE}/metrics/`]: refuse(401) });

    // When
    const errors = await Promise.all([forbidden, revoked].map((ctx) => paddleConnector.fetch(request(["mrr"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toContain("metrics.read");
    expect(errors[1]).toBeInstanceOf(ConnectorError);
    expect((errors[1] as Error).message).toContain("refused the API key");
    for (const error of errors) expect((error as Error).message).not.toContain(KEY.slice(-4));
  });

  test("given a rate limit, when fetched, then the error passes through untouched", async () => {
    // Given
    const limited = new HttpError(429, `${LIVE}/metrics/revenue`, "");
    const ctx = fakeContext({
      [`${LIVE}/metrics/revenue`]: () => {
        throw limited;
      },
    });

    // When
    const attempt = paddleConnector.fetch(request(["revenue30d"]), ctx);

    // Then
    await expect(attempt).rejects.toBe(limited);
  });
});
