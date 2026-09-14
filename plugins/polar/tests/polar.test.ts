import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import polar, { polarConnector } from "../src/index";

/** Responses shaped after the schemas in Polar's API reference (MetricsResponse, ListResource[Organization]). */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.polar.sh/v1";
const TOKEN = "polar_oat_Zq8XnF2mB7yKp4LwR9cT1vHs6JdE3uGa0oYiNk5Qx";
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { token: TOKEN }, public: null });
const refuse = (status: number) => () => {
  throw new HttpError(status, `${API}/metrics/`, '{"error":"Unauthorized","detail":"Unauthorized"}');
};

describe("polar plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([polar]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given Polar's metrics in cents, when both metrics are fetched, then one request returns MRR in dollars and the count", async () => {
    // Given
    let sent: GuardedFetchInit | undefined;
    const ctx = fakeContext(
      {
        [`${API}/metrics/`]: (init?: GuardedFetchInit) => {
          sent = init;
          return fixture("metrics");
        },
      },
      { today: "2026-09-14" }
    );
    const keys = ["mrr", "active-subscriptions"].map((metric) => polarConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await polarConnector.fetch(request(["mrr", "active-subscriptions"]), ctx);

    // Then
    expect(values.mrr).toEqual(money(2750, "usd"));
    expect(values["active-subscriptions"]).toEqual(number(143, { unit: "count" }));
    expect(ctx.calls).toEqual([`${API}/metrics/?start_date=2026-09-14&end_date=2026-09-14&interval=day&metrics=monthly_recurring_revenue&metrics=active_subscriptions`]);
    expect(sent?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "Polar-Version": "2026-04" });
    expect(new Set(keys).size).toBe(1);
  });

  test("given totals without a value, when fetched, then the last day with one is used, and nothing at all gives no value", async () => {
    // Given
    const partial = fixture("metrics");
    partial.totals = {};
    partial.periods = [
      { timestamp: "2026-09-13T00:00:00Z", monthly_recurring_revenue: 10_000, active_subscriptions: 4 },
      { timestamp: "2026-09-14T00:00:00Z", monthly_recurring_revenue: 12_049, active_subscriptions: null },
    ];
    const empty = { periods: [], totals: {}, metrics: {} };

    // When
    const fromPeriods = await polarConnector.fetch(request(["mrr"]), fakeContext({ [`${API}/metrics/`]: partial }));
    const fromNothing = await polarConnector.fetch(request(["mrr"]), fakeContext({ [`${API}/metrics/`]: empty }));

    // Then
    expect(fromPeriods.mrr).toEqual(money(120, "usd"));
    expect(fromPeriods["active-subscriptions"]).toEqual(number(4, { unit: "count" }));
    expect(fromNothing).toEqual({ mrr: null, "active-subscriptions": null });
  });

  test("given a valid organization token, when connecting, then the organization is described without the token", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/organizations/`]: fixture("organizations"), [`${API}/metrics/`]: fixture("metrics") });

    // When
    const result = await polarConnector.connect!({ token: TOKEN }, ctx);

    // Then
    expect(result.secret).toEqual({ token: TOKEN });
    expect(result.public).toEqual({ hint: "polar_oat_…k5Qx", organization: "Acme Inc", slug: "acme" });
    expect(result.label).toBe("Polar: Acme Inc");
    expect(result.accountId).toBe("1dbfc517-0bbf-4301-9ba8-555ca42b9737");
    expect(ctx.calls.map((u) => u.split("?")[0])).toEqual([`${API}/organizations/`, `${API}/metrics/`]);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(TOKEN);
    expect(shown).not.toContain(TOKEN.slice(10, 30));
  });

  test("given a personal access token, when connecting, then it's refused before any request", async () => {
    // Given
    const ctx = fakeContext({});
    const personal = "polar_pat_Zq8XnF2mB7yKp4LwR9cT1vHs6JdE3uGa0oYiNk5Qx";

    // When
    const attempt = polarConnector.connect!({ token: personal }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("organization access token");
    expect(ctx.calls).toEqual([]);
    expect(validateFields(polarConnector.auth!.fields, { token: personal }).error).toContain("polar_oat_");
    expect(validateFields(polarConnector.auth!.fields, { token: TOKEN }).error).toBeNull();
  });

  test("given a token without metrics:read, when connecting, then the owner is told which scopes to grant", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/organizations/`]: fixture("organizations"), [`${API}/metrics/`]: refuse(403) });

    // When
    const attempt = polarConnector.connect!({ token: TOKEN }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("metrics:read and organizations:read");
  });

  test("given a revoked token, when fetched, then the owner gets a sentence that doesn't repeat the token", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/metrics/`]: refuse(401) });

    // When
    const error = await polarConnector.fetch(request(["mrr"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("refused the token");
    expect((error as Error).message).not.toContain(TOKEN.slice(-4));
  });

  test("given an outage, when fetched, then the error passes through untouched", async () => {
    // Given
    const outage = new HttpError(502, `${API}/metrics/`, "");
    const ctx = fakeContext({
      [`${API}/metrics/`]: () => {
        throw outage;
      },
    });

    // When
    const attempt = polarConnector.fetch(request(["mrr"]), ctx);

    // Then
    await expect(attempt).rejects.toBe(outage);
  });
});
