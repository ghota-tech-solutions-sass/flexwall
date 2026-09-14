import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import trading212, { returnPercent, trading212Connector } from "../src/index";

/** Shaped after the AccountSummary schema in Trading 212's OpenAPI description, which has no example. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const SUMMARY = "https://live.trading212.com/api/v0/equity/account/summary";
const KEY = "32194417ZqYbNxWvKcJmHfPd";
const SECRET = "t8Kq2XnV-7mBz4LwR9cT1vHs6JdE3uGa0oYiNk5Q";
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY, secret: SECRET }, public: null });
const refuse = (status: number, body = "") => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, body);
};

describe("trading212 plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([trading212]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the metrics, when declared, then amounts are sensitive, the return isn't, and only the portfolio value is on the wealth board", () => {
    // Given
    const metrics = trading212Connector.metrics;

    // When
    const sensitive = metrics.filter((m) => m.sensitive).map((m) => m.id);
    const wealth = metrics.filter((m) => m.leaderboard === "wealth").map((m) => m.id);

    // Then
    expect(sensitive).toEqual(["portfolio-value", "cash", "result"]);
    expect(wealth).toEqual(["portfolio-value"]);
    expect(trading212Connector.tier).toBe("pro");
    expect(trading212Connector.verified).toBe(true);
  });

  test("given an account summary, when every metric is fetched, then one request with Basic auth answers them all", async () => {
    // Given
    let sent: GuardedFetchInit | undefined;
    const ctx = fakeContext({
      [SUMMARY]: (init) => {
        sent = init;
        return fixture("summary");
      },
    });
    const keys = trading212Connector.metrics.map((m) => trading212Connector.cacheKey!({ metric: m.id, params: {} }));

    // When
    const values = await trading212Connector.fetch(request(["portfolio-value", "cash", "result", "return"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(48730.1, "gbp"));
    expect(values.cash).toEqual(money(2140.37, "gbp"));
    expect(values.result).toEqual(money(5380.51, "gbp"));
    expect(values.return).toEqual(number(13.16, { unit: "percent" }));
    expect(ctx.calls).toEqual([SUMMARY]);
    expect(sent?.headers?.Authorization).toBe(`Basic ${btoa(`${KEY}:${SECRET}`)}`);
    expect(new Set(keys).size).toBe(1);
  });

  test("given nothing invested or a loss, when the return is computed, then it's null or negative", () => {
    // Given
    const empty = { investments: { currentValue: 0, realizedProfitLoss: 0, totalCost: 0, unrealizedProfitLoss: 0 } };
    const loss = { investments: { currentValue: 900, realizedProfitLoss: 0, totalCost: 1000, unrealizedProfitLoss: -100 } };

    // When
    const returns = [empty, loss].map(returnPercent);

    // Then
    expect(returns).toEqual([null, -10]);
  });

  test("given a summary missing amounts, when fetched, then those metrics have no value", async () => {
    // Given
    const ctx = fakeContext({ [SUMMARY]: { ...fixture("summary"), totalValue: null, cash: {}, investments: {} } });

    // When
    const values = await trading212Connector.fetch(request(["portfolio-value"]), ctx);

    // Then
    expect(values).toEqual({ "portfolio-value": null, cash: null, result: null, return: null });
  });

  test("given a valid key and secret, when connecting, then the account is described without them", async () => {
    // Given
    const ctx = fakeContext({ [SUMMARY]: fixture("summary") });

    // When
    const result = await trading212Connector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    expect(result.secret).toEqual({ key: KEY, secret: SECRET });
    expect(result.public).toEqual({ hint: "…HfPd", account: "…7736", currency: "gbp" });
    expect(result.label).toBe("Trading 212 (…7736)");
    expect(result.accountId).toBe("20417736");
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(SECRET);
    expect(shown).not.toContain(SECRET.slice(-4));
    expect(shown).not.toContain(KEY.slice(0, 12));
  });

  test("given a key and secret Trading 212 refuses, when connecting, then the owner gets a sentence that doesn't repeat them", async () => {
    // Given
    const ctx = fakeContext({ [SUMMARY]: refuse(401) });

    // When
    const error = await trading212Connector.connect!({ key: KEY, secret: SECRET }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("refused this key and secret");
    expect((error as Error).message).not.toContain(SECRET.slice(-4));
    expect((error as Error).message).not.toContain(KEY.slice(-4));
  });

  test("given a key without the account scope, when fetched, then the owner is told which permission to grant", async () => {
    // Given
    const ctx = fakeContext({ [SUMMARY]: refuse(403, "Scope( account ) missing for API key") });

    // When
    const attempt = trading212Connector.fetch(request(["cash"]), ctx);

    // Then
    await expect(attempt).rejects.toThrow("Account data permission");
  });

  test("given a key with a colon, when validated, then the form refuses it", () => {
    // Given
    const fields = trading212Connector.auth!.fields;

    // When
    const withColon = validateFields(fields, { key: "abcd:efgh1234", secret: SECRET });
    const fine = validateFields(fields, { key: KEY, secret: "with:colon:secret" });

    // Then
    expect(withColon.error).toContain("colons");
    expect(fine.error).toBeNull();
  });

  test("given a rate limit, a timeout or an outage, when fetched, then the error passes through untouched", async () => {
    // Given
    const errors = [429, 408, 502].map((status) => new HttpError(status, SUMMARY, ""));

    // When
    const thrown = [];
    for (const error of errors) {
      const ctx = fakeContext({
        [SUMMARY]: () => {
          throw error;
        },
      });
      thrown.push(await trading212Connector.fetch(request(["cash"]), ctx).catch((e: unknown) => e));
    }

    // Then
    thrown.forEach((error, i) => expect(error).toBe(errors[i]));
  });
});
