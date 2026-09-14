import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import npm, { npmConnector } from "../src/index";

/** A real answer from https://api.npmjs.org/downloads/range/last-month/left-pad, zero-count days included. */
const leftPad = JSON.parse(readFileSync(new URL("./fixtures/range-last-month-left-pad.json", import.meta.url), "utf8"));
const ALL = ["weekly-downloads", "monthly-downloads", "daily-downloads"];
const request = (metrics: string[], params: Record<string, string>) => ({ metrics, params, secret: null, public: null });

describe("npm plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([npm]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the real 30-day range of left-pad, when fetched, then weekly and monthly match npm's own totals", async () => {
    // Given
    const ctx = fakeContext({ "https://api.npmjs.org/downloads/range/last-month/left-pad": leftPad });

    // When
    const values = await npmConnector.fetch(request(ALL, { package: "left-pad" }), ctx);

    // Then: point/last-week and point/last-month answered 1154291 and 6236663 the same day
    expect(values["weekly-downloads"]).toEqual(number(1154291, { unit: "count" }));
    expect(values["monthly-downloads"]).toEqual(number(6236663, { unit: "count" }));
  });

  test("given the real 30-day range, when daily downloads are fetched, then 30 points come back oldest first", async () => {
    // Given
    const ctx = fakeContext({ "https://api.npmjs.org/downloads/range/last-month/left-pad": leftPad });

    // When
    const values = await npmConnector.fetch(request(["daily-downloads"], { package: "left-pad" }), ctx);

    // Then
    const daily = values["daily-downloads"];
    expect(daily?.type).toBe("series");
    if (daily?.type !== "series") return;
    expect(daily.unit).toBe("count");
    expect(daily.points).toHaveLength(30);
    expect(daily.points[0]).toEqual({ t: "2026-08-13", v: 263563 });
    expect(daily.points.at(-1)).toEqual({ t: "2026-09-11", v: 250050 });
  });

  test("given tiles for every metric of one package, when grouped and fetched, then one request answers them all", async () => {
    // Given
    const ctx = fakeContext({ "https://api.npmjs.org/downloads/range/last-month/left-pad": leftPad });
    const keys = ALL.map((metric) => npmConnector.cacheKey!({ metric, params: { package: "left-pad" } }));

    // When
    const values = await npmConnector.fetch(request(ALL, { package: "left-pad" }), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(Object.keys(values).sort()).toEqual([...ALL].sort());
    expect(ctx.calls).toHaveLength(1);
  });

  test("given two packages that differ only by case, when grouped, then they don't share a request", () => {
    // Given
    const packages = ["JSONStream", "jsonstream"];

    // When
    const keys = packages.map((name) => npmConnector.cacheKey!({ metric: "weekly-downloads", params: { package: name } }));

    // Then
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("given a scoped package, when fetched, then the scope stays in the path", async () => {
    // Given
    const ctx = fakeContext({ "https://api.npmjs.org/downloads/range/last-month/@types/node": { ...leftPad, package: "@types/node" } });

    // When
    const values = await npmConnector.fetch(request(["weekly-downloads"], { package: "@types/node" }), ctx);

    // Then
    expect(ctx.calls).toEqual(["https://api.npmjs.org/downloads/range/last-month/@types/node"]);
    expect(values["weekly-downloads"]?.type).toBe("number");
  });

  test("given names typed in the package field, when validated, then real names pass and the rest get a sentence", () => {
    // Given
    const params = npmConnector.metrics[0].params!;

    // When
    const accepted = ["react", "@types/node", "JSONStream", "lodash.debounce", "left-pad"].map((name) => validateFields(params, { package: name }).error);
    const rejected = ["", "@types", "a/b", ".hidden", "_private", "has space", "https://npmjs.com/react"].map((name) => validateFields(params, { package: name }).error);

    // Then
    expect(accepted).toEqual([null, null, null, null, null]);
    expect(rejected.every((error) => typeof error === "string")).toBe(true);
  });

  test("given a package npm doesn't know, when fetched, then the owner gets a plain sentence", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.npmjs.org/downloads/": () => {
        throw new HttpError(404, "https://api.npmjs.org/downloads/range/last-month/nope-zzz", '{"error":"package nope-zzz not found"}');
      },
    });

    // When
    const attempt = npmConnector.fetch(request(ALL, { package: "nope-zzz" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("npm has no package called nope-zzz.");
  });

  test("given npm is rate limiting, when fetched, then the error goes through untouched so the last good value stays", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.npmjs.org/downloads/": () => {
        throw new HttpError(429, "https://api.npmjs.org/downloads/range/last-month/react", "");
      },
    });

    // When
    const attempt = npmConnector.fetch(request(ALL, { package: "react" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(HttpError);
  });

  test("given a range with no days, when fetched, then every metric is null rather than a made-up zero", async () => {
    // Given
    const ctx = fakeContext({ "https://api.npmjs.org/downloads/range/last-month/brand-new": { start: "2026-08-13", end: "2026-09-11", package: "brand-new", downloads: [] } });

    // When
    const values = await npmConnector.fetch(request(ALL, { package: "brand-new" }), ctx);

    // Then
    expect(values).toEqual({ "weekly-downloads": null, "monthly-downloads": null, "daily-downloads": null });
  });

  test("given the sample, when read, then weekly and monthly agree with the daily series", () => {
    // Given
    const { sample } = npmConnector;

    // When
    const daily = sample["daily-downloads"];
    const points = daily.type === "series" ? daily.points : [];

    // Then
    expect(points).toHaveLength(30);
    expect(sample["weekly-downloads"]).toEqual(number(points.slice(-7).reduce((s, p) => s + p.v, 0), { unit: "count" }));
    expect(sample["monthly-downloads"]).toEqual(number(points.reduce((s, p) => s + p.v, 0), { unit: "count" }));
  });
});
