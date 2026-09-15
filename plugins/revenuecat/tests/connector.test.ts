import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import revenuecat, { revenuecatConnector } from "../src/index";

/** Shaped after OverviewMetrics / OverviewMetric in RevenueCat's API v2 OpenAPI description. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.revenuecat.com/v2";
const KEY = "sk_Zq8XnF2mB7yKp4LwR9cT1vHs6JdE3uGa";
const PROJECT = "proj1ab2c3d4";
const OVERVIEW = `${API}/projects/${PROJECT}/metrics/overview`;
const ALL = ["mrr", "revenue28d", "active-subscriptions", "active-trials", "new-customers-28d", "active-users-28d"];
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY }, public: { project: PROJECT } });
const refuse = (status: number) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, '{"object":"error","type":"authentication_error","message":"Invalid API key","retryable":false}');
};

describe("revenuecat plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([revenuecat]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given an overview in euros, when every metric is fetched, then one request answers all of them in the project's currency", async () => {
    // Given
    let sent: GuardedFetchInit | undefined;
    const ctx = fakeContext({
      [OVERVIEW]: (init) => {
        sent = init;
        return fixture("overview");
      },
    });
    const keys = ALL.map((metric) => revenuecatConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await revenuecatConnector.fetch(request(ALL), ctx);

    // Then
    expect(values).toEqual({
      mrr: money(6240, "eur"),
      revenue28d: money(7115, "eur"),
      "active-subscriptions": number(1318, { unit: "count" }),
      "active-trials": number(96, { unit: "count" }),
      "new-customers-28d": number(2410, { unit: "count" }),
      "active-users-28d": number(18_730, { unit: "count" }),
    });
    expect(ctx.calls).toEqual([OVERVIEW]);
    expect(sent?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    expect(new Set(keys).size).toBe(1);
  });

  test("given an overview missing some metrics and without a currency, when fetched, then those metrics have no value and money is in dollars", async () => {
    // Given
    const partial = fixture("overview");
    delete partial.currency;
    partial.metrics = partial.metrics.filter((m: { id: string }) => m.id === "mrr" || m.id === "active_trials");

    // When
    const values = await revenuecatConnector.fetch(request(ALL), fakeContext({ [OVERVIEW]: partial }));

    // Then
    expect(values.mrr).toEqual(money(6240, "usd"));
    expect(values["active-trials"]).toEqual(number(96, { unit: "count" }));
    expect(values.revenue28d).toBeNull();
    expect(values["active-subscriptions"]).toBeNull();
  });

  test("given a project id with odd characters, when fetched, then it is encoded in the path", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/projects/`]: fixture("overview") });

    // When
    await revenuecatConnector.fetch({ ...request(["mrr"]), public: { project: "a/b" } }, ctx);

    // Then
    expect(ctx.calls).toEqual([`${API}/projects/a%2Fb/metrics/overview`]);
  });

  test("given a valid V2 key and project, when connecting, then the connection is described without the key", async () => {
    // Given
    const ctx = fakeContext({ [OVERVIEW]: fixture("overview") });

    // When
    const result = await revenuecatConnector.connect!({ key: KEY, project: PROJECT }, ctx);

    // Then
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "sk_…3uGa", project: PROJECT, currency: "eur" });
    expect(result.label).toBe(`RevenueCat (${PROJECT})`);
    expect(result.accountId).toBe(PROJECT);
    expect(ctx.calls).toEqual([OVERVIEW]);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(KEY);
    expect(shown).not.toContain(KEY.slice(3, 25));
  });

  test("given a public SDK key, when connecting, then it's refused before any request", async () => {
    // Given
    const ctx = fakeContext({});
    const publicKey = "appl_Zq8XnF2mB7yKp4LwR9cT1vHs6JdE3";

    // When
    const attempt = revenuecatConnector.connect!({ key: publicKey, project: PROJECT }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("secret API key");
    expect(ctx.calls).toEqual([]);
    expect(validateFields(revenuecatConnector.auth!.fields, { key: publicKey, project: PROJECT }).error).toContain("sk_");
    expect(validateFields(revenuecatConnector.auth!.fields, { key: KEY, project: PROJECT }).error).toBeNull();
  });

  test("given a rejected key, a missing permission or an unknown project, when connecting, then the owner gets a sentence that doesn't repeat the key", async () => {
    // Given
    const cases = [401, 403, 404].map((status) => fakeContext({ [OVERVIEW]: refuse(status) }));

    // When
    const errors = await Promise.all(cases.map((ctx) => revenuecatConnector.connect!({ key: KEY, project: PROJECT }, ctx).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).not.toContain(KEY.slice(-4));
    }
    expect((errors[0] as Error).message).toContain("V2 secret key");
    expect((errors[1] as Error).message).toContain("Charts & metrics");
    expect((errors[2] as Error).message).toContain("no project");
  });

  test("given a rate limit or an outage, when fetched, then the error passes through untouched", async () => {
    // Given
    const limited = new HttpError(429, OVERVIEW, '{"type":"rate_limit_error"}');
    const ctx = fakeContext({
      [OVERVIEW]: () => {
        throw limited;
      },
    });

    // When
    const attempt = revenuecatConnector.fetch(request(["mrr"]), ctx);

    // Then
    await expect(attempt).rejects.toBe(limited);
  });
});
