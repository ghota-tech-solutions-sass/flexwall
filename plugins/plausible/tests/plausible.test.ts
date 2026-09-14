import { describe, expect, test } from "bun:test";
import { BlockedRequestError, checkPlugins, ConnectorError, HttpError, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plausible, { dailyPoints, plausibleConnector } from "../src/index";

const KEY = "pl4usibleT3stK3y-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
const QUERY = "https://plausible.io/api/v2/query";
const request = (metrics: string[], site = "example.com", instance = "https://plausible.io") => ({ metrics, params: { site }, secret: { key: KEY }, public: { hint: "…IJKL", instance } });

/** Answers from the documented v2 response shape: totals for an aggregate query, one row per day for time:day. */
function plausibleApi(sent: object[] = []) {
  return (init?: GuardedFetchInit) => {
    const body = JSON.parse(init?.body ?? "{}") as { dimensions?: string[] };
    sent.push(body);
    if (body.dimensions?.includes("time:day")) {
      return {
        results: [
          { metrics: [120], dimensions: ["2026-08-15"] },
          { metrics: [95], dimensions: ["2026-08-17"] },
        ],
        meta: { imports_included: false, time_labels: ["2026-08-15", "2026-08-16", "2026-08-17"] },
        query: body,
      };
    }
    return { results: [{ metrics: [18420, 47310], dimensions: [] }], meta: { imports_included: false }, query: body };
  };
}

const plausibleError = (status: number, error: string) => () => {
  throw new HttpError(status, QUERY, JSON.stringify({ error }));
};

describe("plausible plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([plausible]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given tiles for every metric of a site, when fetched, then one group answers all with a totals query and a daily query", async () => {
    // Given
    const sent: object[] = [];
    let authorization = "";
    const api = plausibleApi(sent);
    const ctx = fakeContext({ [QUERY]: (init?: GuardedFetchInit) => ((authorization = init?.headers?.Authorization ?? ""), api(init)) });
    const keys = ["visitors-30d", "pageviews-30d", "visitors-daily"].map((metric) => plausibleConnector.cacheKey!({ metric, params: { site: "Example.com" } }));

    // When
    const values = await plausibleConnector.fetch(request(["visitors-30d", "pageviews-30d", "visitors-daily"]), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([QUERY, QUERY]);
    expect(authorization).toBe(`Bearer ${KEY}`);
    expect(sent).toEqual([
      { site_id: "example.com", metrics: ["visitors", "pageviews"], date_range: "30d" },
      { site_id: "example.com", metrics: ["visitors"], date_range: "30d", dimensions: ["time:day"], include: { time_labels: true } },
    ]);
    expect(values["visitors-30d"]).toEqual(number(18420, { unit: "count" }));
    expect(values["pageviews-30d"]).toEqual(number(47310, { unit: "count" }));
    expect(values["visitors-daily"]).toEqual({
      type: "series",
      unit: "count",
      points: [
        { t: "2026-08-15", v: 120 },
        { t: "2026-08-16", v: 0 },
        { t: "2026-08-17", v: 95 },
      ],
    });
  });

  test("given only a visitors tile, when fetched, then the daily query isn't made", async () => {
    // Given
    const ctx = fakeContext({ [QUERY]: plausibleApi() });

    // When
    const values = await plausibleConnector.fetch(request(["visitors-30d"]), ctx);

    // Then
    expect(ctx.calls).toHaveLength(1);
    expect(values["visitors-30d"]).toEqual(number(18420, { unit: "count" }));
  });

  test("given a daily answer without time labels, when points are built, then they come back oldest first", () => {
    // Given
    const response = { results: [{ metrics: [3], dimensions: ["2026-08-17"] }, { metrics: [5], dimensions: ["2026-08-15"] }] };

    // When
    const points = dailyPoints(response);

    // Then
    expect(points).toEqual([
      { t: "2026-08-15", v: 5 },
      { t: "2026-08-17", v: 3 },
    ]);
  });

  test("given a good key, when connecting, then Plausible's missing site answer proves the key and only a hint is shown", async () => {
    // Given
    const sent: object[] = [];
    const ctx = fakeContext({
      [QUERY]: (init?: GuardedFetchInit) => {
        sent.push(JSON.parse(init?.body ?? "{}"));
        throw new HttpError(400, QUERY, JSON.stringify({ error: "Missing site ID. Please provide the required site_id parameter with your request." }));
      },
    });
    const input = validateFields(plausibleConnector.auth!.fields, { key: KEY }).values;

    // When
    const result = await plausibleConnector.connect!(input, ctx);

    // Then
    expect(sent).toEqual([{ metrics: ["visitors"], date_range: "day" }]);
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "…IJKL", instance: "https://plausible.io" });
    expect(result.label).toBe("Plausible (plausible.io)");
    expect(JSON.stringify([result.public, result.label])).not.toContain(KEY);
  });

  test("given an instance that answers a query without a site, when connecting, then the key is still accepted", async () => {
    // Given
    const ctx = fakeContext({ [QUERY]: plausibleApi() });

    // When
    const result = await plausibleConnector.connect!({ key: KEY, instance: "https://plausible.io" }, ctx);

    // Then
    expect(result.public.hint).toBe("…IJKL");
  });

  test("given a wrong key, when connecting, then the owner gets a sentence that never contains the key", async () => {
    // Given
    const ctx = fakeContext({ [QUERY]: plausibleError(401, "Invalid API key. Please make sure you're using a valid API key with access to the resource you've requested.") });

    // When
    const error = await plausibleConnector.connect!({ key: KEY, instance: "https://plausible.io" }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Plausible refused the key.");
    expect((error as Error).message).not.toContain(KEY);
  });

  test("given a self-hosted address, when connecting and fetching, then requests go to that instance", async () => {
    // Given
    const instanceQuery = "https://stats.example.org/api/v2/query";
    const ctx = fakeContext({
      [instanceQuery]: (init?: GuardedFetchInit) => {
        if (!init?.body?.includes("site_id")) throw new HttpError(400, instanceQuery, JSON.stringify({ error: "Missing site ID." }));
        return plausibleApi()(init);
      },
    });

    // When
    const connection = await plausibleConnector.connect!({ key: KEY, instance: "https://stats.example.org/" }, ctx);
    const values = await plausibleConnector.fetch({ metrics: ["pageviews-30d"], params: { site: "example.com" }, secret: connection.secret, public: connection.public }, ctx);

    // Then
    expect(connection.label).toBe("Plausible (stats.example.org)");
    expect(ctx.calls).toEqual([instanceQuery, instanceQuery]);
    expect(values["pageviews-30d"]).toEqual(number(47310, { unit: "count" }));
  });

  test("given an address that isn't Plausible or can't be reached, when connecting, then the owner gets a sentence", async () => {
    // Given
    const notPlausible = fakeContext({ "https://example.org/": plausibleError(400, "Bad request") });
    const unreachable = fakeContext({
      "https://10.0.0.1/": () => {
        throw new BlockedRequestError("refused a private address");
      },
    });

    // When
    const errors = await Promise.all([
      plausibleConnector.connect!({ key: KEY, instance: "https://example.org" }, notPlausible).catch((e: unknown) => e),
      plausibleConnector.connect!({ key: KEY, instance: "https://10.0.0.1" }, unreachable).catch((e: unknown) => e),
    ]);

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect(errors[1]).toBeInstanceOf(ConnectorError);
  });

  test("given a site the key can't read, when fetched, then the owner is told to check the key and the site", async () => {
    // Given
    const ctx = fakeContext({ [QUERY]: plausibleError(401, "Invalid API key or site ID. Please make sure you're using a valid API key with access to the site you've requested.") });

    // When
    const error = await plausibleConnector.fetch(request(["visitors-30d"], "other.com"), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("other.com");
    expect((error as Error).message).not.toContain(KEY);
  });

  test("given Plausible is rate limiting, when fetched, then the error passes through so the last good value stays", async () => {
    // Given
    const ctx = fakeContext({ [QUERY]: plausibleError(429, "Too many API requests. The limit is 600 per hour. Please contact us to request more capacity.") });

    // When
    const error = await plausibleConnector.fetch(request(["visitors-30d"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(ConnectorError);
  });
});
