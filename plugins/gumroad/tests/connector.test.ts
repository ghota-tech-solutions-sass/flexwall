import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import gumroad, { gumroadConnector, readSummary } from "../src/index";

/**
 * user.json is the example from Gumroad's API reference. sales-summary.json
 * follows Api::V2::SalesSummary#as_json in Gumroad's open-source server.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.gumroad.com/v2";
const TOKEN = "abf11e4ab2850ffd50ef690257f7a1c998a443059513d1a4826f2b3159620505";
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { token: TOKEN }, public: null });

/** The summary route answers the 30-day window without `from`, and the all-time window with it. */
function summaries(allTime: object, thirtyDays: object = fixture("sales-summary")) {
  return (_init: GuardedFetchInit | undefined, url: string) => (new URL(url).searchParams.has("from") ? allTime : thirtyDays);
}

describe("gumroad plugin", () => {
  test("given the plugin, when checked, then it has no problems and nothing enters the revenue leaderboard", () => {
    // Given / When
    const problems = checkPlugins([gumroad]);

    // Then
    expect(problems).toEqual([]);
    expect(gumroadConnector.metrics.some((m) => m.leaderboard === "revenue")).toBe(false);
  });

  test("given a summary with refunds, when read, then revenue is net of refunds in dollars and sales are Gumroad's count", () => {
    // Given
    const summary = fixture("sales-summary");

    // When
    const values = readSummary(summary);

    // Then
    expect(values).toEqual({ revenue: 2190, sales: 101 });
  });

  test("given every metric, when fetched, then one 30-day and one all-time summary answer all of them with the token in a header", async () => {
    // Given
    const allTime = { ...fixture("sales-summary"), gross_cents: 5_012_345, net_cents: 4_876_049, units: 2_320, refunded_units: 6, from: "2011-01-01" };
    let sent: GuardedFetchInit | undefined;
    const answer = summaries(allTime);
    const ctx = fakeContext({
      [`${API}/sales/summary`]: (init, url) => {
        sent = init;
        return answer(init, url);
      },
    });
    const keys = ["revenue-total", "sales", "revenue30d", "sales30d"].map((metric) => gumroadConnector.cacheKey!({ metric, params: {} }));

    // When
    const values = await gumroadConnector.fetch(request(["revenue-total", "sales", "revenue30d", "sales30d"]), ctx);

    // Then
    expect(values).toEqual({
      revenue30d: money(2190, "usd"),
      sales30d: number(101, { unit: "count" }),
      "revenue-total": money(48_760, "usd"),
      sales: number(2_320, { unit: "count" }),
    });
    expect(ctx.calls).toEqual([`${API}/sales/summary`, `${API}/sales/summary?from=2011-01-01`]);
    expect(sent?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(ctx.calls.join()).not.toContain(TOKEN);
    expect(new Set(keys).size).toBe(1);
  });

  test("given only the 30-day revenue is needed, when fetched, then the all-time summary isn't requested", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/sales/summary`]: summaries({}) });

    // When
    const values = await gumroadConnector.fetch(request(["revenue30d"]), ctx);

    // Then
    expect(values.revenue30d).toEqual(money(2190, "usd"));
    expect(ctx.calls).toEqual([`${API}/sales/summary`]);
  });

  test("given a valid token, when connecting, then the seller is described without the token", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/user`]: fixture("user"), [`${API}/sales/summary`]: fixture("sales-summary") });

    // When
    const result = await gumroadConnector.connect!({ token: TOKEN }, ctx);

    // Then
    expect(result.secret).toEqual({ token: TOKEN });
    expect(result.public).toEqual({ hint: "…0505", name: "John Smith", url: "https://gumroad.com/sailorjohn" });
    expect(result.label).toBe("Gumroad: John Smith");
    expect(result.accountId).toBe("G_-mnBf9b1j9A7a4ub4nFQ==");
    expect(ctx.calls).toEqual([`${API}/user`, `${API}/sales/summary`]);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(TOKEN);
    expect(shown).not.toContain(TOKEN.slice(10, 40));
  });

  test("given a token that isn't one, when validated, then the form refuses it", () => {
    // Given
    const fields = gumroadConnector.auth!.fields;

    // When
    const bad = validateFields(fields, { token: "my password" });
    const good = validateFields(fields, { token: TOKEN });

    // Then
    expect(bad.error).toContain("letters, digits");
    expect(good.error).toBeNull();
  });

  test("given a revoked token, when connecting, then the owner gets a sentence that doesn't repeat the token", async () => {
    // Given
    const ctx = fakeContext({
      [`${API}/user`]: (_init, url) => {
        throw new HttpError(401, url, "");
      },
    });

    // When
    const error = await gumroadConnector.connect!({ token: TOKEN }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("refused the access token");
    expect((error as Error).message).not.toContain(TOKEN.slice(-4));
  });

  test("given a token without view_sales, when connecting, then the owner is told which scope is missing", async () => {
    // Given
    const ctx = fakeContext({
      [`${API}/user`]: fixture("user"),
      [`${API}/sales/summary`]: (_init, url) => {
        throw new HttpError(403, url, "");
      },
    });

    // When
    const attempt = gumroadConnector.connect!({ token: TOKEN }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("view_sales");
  });

  test("given a summary query that timed out, when fetched, then the error passes through untouched", async () => {
    // Given
    const timedOut = new HttpError(400, `${API}/sales/summary`, '{"status":400,"error":"Query timed out."}');
    const ctx = fakeContext({
      [`${API}/sales/summary`]: () => {
        throw timedOut;
      },
    });

    // When
    const attempt = gumroadConnector.fetch(request(["sales"]), ctx);

    // Then
    await expect(attempt).rejects.toBe(timedOut);
  });
});
