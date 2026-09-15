import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, series, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import alpaca, { alpacaConnector, dayChange, historyPoints, toNumber } from "../src/index";

/** Responses shaped after the examples in Alpaca's Trading API reference (Get Account, Get Account Portfolio History). */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.alpaca.markets";
const KEY_ID = "AKZ3N8QW7RT2YV5XM4LP";
const SECRET_KEY = "Hq7vT2mX9kLp4sWz8nRb3cYf6dGj1eUa5oKi0tQx";
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { keyId: KEY_ID, secretKey: SECRET_KEY }, public: null });
const refuse = (status: number) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, '{"code":40110000,"message":"request is not authorized"}');
};

describe("alpaca plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([alpaca]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the metrics, when declared, then money is sensitive, percent isn't, and only equity is on the wealth board", () => {
    // Given
    const metrics = alpacaConnector.metrics;

    // When
    const sensitive = metrics.filter((m) => m.sensitive).map((m) => m.id);
    const wealth = metrics.filter((m) => m.leaderboard === "wealth").map((m) => m.id);

    // Then
    expect(sensitive).toEqual(["equity", "cash", "equity-history"]);
    expect(wealth).toEqual(["equity"]);
    expect(alpacaConnector.tier).toBe("pro");
    expect(alpacaConnector.verified).toBe(true);
  });

  test("given Alpaca's decimal strings, when parsed, then numbers come back and garbage is null", () => {
    // Given
    const raw = ["122011.09751111286868", "0", "", "abc", null, 12.5];

    // When
    const parsed = raw.map(toNumber);

    // Then
    expect(parsed).toEqual([122011.09751111286868, 0, null, null, null, 12.5]);
  });

  test("given equity and last equity, when the day change is computed, then it's in percent, and no previous close gives null", () => {
    // Given
    const up = { equity: "110", last_equity: "100" };
    const down = { equity: "123346.11", last_equity: "122011.09751111286868" };
    const fresh = { equity: "500", last_equity: "0" };

    // When
    const changes = [up, down, fresh].map(dayChange);

    // Then
    expect(changes).toEqual([10, 1.09, null]);
  });

  test("given every metric, when fetched, then one account request and one history request answer them with the keys in headers", async () => {
    // Given
    const sent: (GuardedFetchInit | undefined)[] = [];
    const ctx = fakeContext({
      [`${API}/v2/account`]: (init) => {
        sent.push(init);
        return fixture("account");
      },
      [`${API}/v2/account/portfolio/history`]: (init) => {
        sent.push(init);
        return fixture("portfolio-history");
      },
    });
    const keys = alpacaConnector.metrics.map((m) => alpacaConnector.cacheKey!({ metric: m.id, params: {} }));

    // When
    const values = await alpacaConnector.fetch(request(["equity", "cash", "day-change", "equity-history"]), ctx);

    // Then
    expect(values.equity).toEqual(money(123346.11, "usd"));
    expect(values.cash).toEqual(money(122086.5, "usd"));
    expect(values["day-change"]).toEqual(number(1.09, { unit: "percent" }));
    expect(values["equity-history"]).toEqual(
      series(
        [
          { t: "2026-09-10", v: 120784.79 },
          { t: "2026-09-14", v: 122011.1 },
          { t: "2026-09-15", v: 123346.11 },
        ],
        { unit: "currency", currency: "usd" }
      )
    );
    expect(ctx.calls).toEqual([`${API}/v2/account`, `${API}/v2/account/portfolio/history?period=1M&timeframe=1D`]);
    expect(sent.every((init) => init?.headers?.["APCA-API-KEY-ID"] === KEY_ID && init.headers["APCA-API-SECRET-KEY"] === SECRET_KEY)).toBe(true);
    expect(new Set(keys).size).toBe(1);
  });

  test("given no tile shows the history, when fetched, then the history isn't requested", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: fixture("account") });

    // When
    const values = await alpacaConnector.fetch(request(["equity"]), ctx);

    // Then
    expect(ctx.calls).toEqual([`${API}/v2/account`]);
    expect(values["equity-history"]).toBeUndefined();
  });

  test("given timestamps out of order, when history points are built, then they come oldest first", () => {
    // Given
    const history = { timestamp: [1789444800, 1789012800], equity: [2, 1], timeframe: "1D" };

    // When
    const points = historyPoints(history);

    // Then
    expect(points).toEqual([
      { t: "2026-09-10", v: 1 },
      { t: "2026-09-15", v: 2 },
    ]);
  });

  test("given valid live keys, when connecting, then the account is described without the keys", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: fixture("account") });

    // When
    const result = await alpacaConnector.connect!({ keyId: KEY_ID, secretKey: SECRET_KEY }, ctx);

    // Then
    expect(result.secret).toEqual({ keyId: KEY_ID, secretKey: SECRET_KEY });
    expect(result.public).toEqual({ hint: "…M4LP", account: "…3279", currency: "usd" });
    expect(result.label).toBe("Alpaca (…3279)");
    expect(result.accountId).toBe("1d9eed04-be39-4e01-9b84-a48ac5bbafcf");
    expect(ctx.calls).toEqual([`${API}/v2/account`]);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(SECRET_KEY);
    expect(shown).not.toContain(SECRET_KEY.slice(-4));
    expect(shown).not.toContain(KEY_ID.slice(0, 16));
  });

  test("given keys Alpaca refuses, when connecting, then the owner gets a sentence that doesn't repeat them", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: refuse(401) });

    // When
    const error = await alpacaConnector.connect!({ keyId: KEY_ID, secretKey: SECRET_KEY }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("refused these keys");
    expect((error as Error).message).not.toContain(SECRET_KEY.slice(-4));
    expect((error as Error).message).not.toContain(KEY_ID.slice(-4));
  });

  test("given a paper account, when connecting, then it's refused", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: { ...fixture("account"), account_number: "PA3ABCDEFGH1" } });

    // When
    const attempt = alpacaConnector.connect!({ keyId: KEY_ID, secretKey: SECRET_KEY }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("paper trading account");
  });

  test("given regenerated keys, when fetched, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: refuse(403) });

    // When
    const attempt = alpacaConnector.fetch(request(["equity"]), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });

  test("given a rate limit or an outage, when fetched, then the error passes through untouched", async () => {
    // Given
    const limited = new HttpError(429, `${API}/v2/account`, "");
    const outage = new HttpError(503, `${API}/v2/account/portfolio/history`, "");
    const throwing = (error: Error) => () => {
      throw error;
    };

    // When
    const first = await alpacaConnector.fetch(request(["equity"]), fakeContext({ [`${API}/v2/account`]: throwing(limited) })).catch((e: unknown) => e);
    const second = await alpacaConnector
      .fetch(request(["equity-history"]), fakeContext({ [`${API}/v2/account`]: fixture("account"), [`${API}/v2/account/portfolio/history`]: throwing(outage) }))
      .catch((e: unknown) => e);

    // Then
    expect(first).toBe(limited);
    expect(second).toBe(outage);
  });

  test("given an account with unreadable amounts, when fetched, then those metrics have no value", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/v2/account`]: { ...fixture("account"), equity: "", last_equity: "0", cash: "n/a" } });

    // When
    const values = await alpacaConnector.fetch(request(["equity", "cash", "day-change"]), ctx);

    // Then
    expect(values).toEqual({ equity: null, cash: null, "day-change": null });
  });
});
