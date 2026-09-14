import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import pypi, { normalizeName, pypiConnector } from "../src/index";

/** A real answer from https://pypistats.org/api/packages/flask-sqlalchemy/recent. Flat enough to keep inline. */
const flaskSqlalchemy = { data: { last_day: 259736, last_month: 16819804, last_week: 2934026 }, package: "flask-sqlalchemy", type: "recent_downloads" };
const URL_FLASK = "https://pypistats.org/api/packages/flask-sqlalchemy/recent";
const ALL = ["last-day-downloads", "weekly-downloads", "monthly-downloads"];
const request = (metrics: string[], params: Record<string, string>) => ({ metrics, params, secret: null, public: null });

describe("pypi plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([pypi]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given a package, when every metric is fetched, then day, week and month come back as counts from one request", async () => {
    // Given
    const ctx = fakeContext({ [URL_FLASK]: flaskSqlalchemy });

    // When
    const values = await pypiConnector.fetch(request(ALL, { package: "flask-sqlalchemy" }), ctx);

    // Then
    expect(values).toEqual({
      "last-day-downloads": number(259736, { unit: "count" }),
      "weekly-downloads": number(2934026, { unit: "count" }),
      "monthly-downloads": number(16819804, { unit: "count" }),
    });
    expect(ctx.calls).toEqual([URL_FLASK]);
  });

  test("given a name typed with capitals, underscores or dots, when fetched, then the normalized name is requested", async () => {
    // Given
    const ctx = fakeContext({ [URL_FLASK]: flaskSqlalchemy });

    // When
    await pypiConnector.fetch(request(["weekly-downloads"], { package: "Flask_SQLAlchemy" }), ctx);
    await pypiConnector.fetch(request(["weekly-downloads"], { package: "flask.sqlalchemy" }), ctx);

    // Then
    expect(ctx.calls).toEqual([URL_FLASK, URL_FLASK]);
  });

  test("given spellings of one package and different metrics, when grouped, then they share one cache key", () => {
    // Given
    const tiles = [
      { metric: "last-day-downloads", params: { package: "Flask_SQLAlchemy" } },
      { metric: "weekly-downloads", params: { package: "flask.sqlalchemy" } },
      { metric: "monthly-downloads", params: { package: "flask-sqlalchemy" } },
    ];

    // When
    const keys = tiles.map((tile) => pypiConnector.cacheKey!(tile));

    // Then
    expect(new Set(keys).size).toBe(1);
  });

  test("given runs of separators, when normalized, then they collapse to one dash like PEP 503 says", () => {
    // Given
    const names = ["Zope.Interface", "backports__zoneinfo", "a-_.b"];

    // When
    const normalized = names.map(normalizeName);

    // Then
    expect(normalized).toEqual(["zope-interface", "backports-zoneinfo", "a-b"]);
  });

  test("given names typed in the package field, when validated, then real names pass and the rest get a sentence", () => {
    // Given
    const params = pypiConnector.metrics[0].params!;

    // When
    const accepted = ["requests", "Flask_SQLAlchemy", "zope.interface", "a"].map((name) => validateFields(params, { package: name }).error);
    const rejected = ["-leading", "trailing.", "has space", "@scope/name", "../admin"].map((name) => validateFields(params, { package: name }).error);

    // Then
    expect(accepted).toEqual([null, null, null, null]);
    expect(rejected.every((error) => typeof error === "string")).toBe(true);
  });

  test("given a package PyPI doesn't know, when fetched, then the owner gets a plain sentence", async () => {
    // Given
    const ctx = fakeContext({
      "https://pypistats.org/api/packages/": () => {
        throw new HttpError(404, "https://pypistats.org/api/packages/nope-zzz/recent", "404");
      },
    });

    // When
    const attempt = pypiConnector.fetch(request(ALL, { package: "nope-zzz" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow("PyPI has no package called nope-zzz.");
  });

  test("given pypistats is rate limiting, when fetched, then the error goes through untouched so the last good value stays", async () => {
    // Given
    const ctx = fakeContext({
      "https://pypistats.org/api/packages/": () => {
        throw new HttpError(429, "https://pypistats.org/api/packages/requests/recent", '<a href="/api/#etiquette">429 RATE LIMIT EXCEEDED</a>');
      },
    });

    // When
    const attempt = pypiConnector.fetch(request(ALL, { package: "requests" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(HttpError);
  });

  test("given an answer with empty data, when fetched, then every metric is null rather than a made-up zero", async () => {
    // Given
    const ctx = fakeContext({ "https://pypistats.org/api/packages/brand-new/recent": { data: {}, package: "brand-new", type: "recent_downloads" } });

    // When
    const values = await pypiConnector.fetch(request(ALL, { package: "brand-new" }), ctx);

    // Then
    expect(values).toEqual({ "last-day-downloads": null, "weekly-downloads": null, "monthly-downloads": null });
  });
});
