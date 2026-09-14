import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import kraken, { assetCode, countAssets, krakenConnector, krakenSignature, makeKrakenConnector, nonceClock } from "../src/index";

/** Responses copied from the examples in Kraken's Spot REST reference. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.kraken.com/0/private";
/** The private key from Kraken's documented API-Sign example: a real-looking secret that belongs to nobody. */
const SECRET = "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==";
const KEY = "4/SDrDBcOOPnm3nPlNfEMMJDeRcIVqPz+QhRxIodyZbI9po/aVRiHsgX";
const NOW = 1_790_000_000_000;
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY, secret: SECRET }, public: null });

/** The documented key info, with only the permissions a test is about. */
function keyInfo(permissions: string[]) {
  const info = fixture("api-key-info");
  info.result.permissions = permissions;
  return info;
}

const refuse = (...errors: string[]) => ({ error: errors });

describe("kraken plugin", () => {
  test("given the plugin, when checked, then it has no problems and only the value is sensitive", () => {
    // Given
    const connector = kraken.connectors![0];

    // When
    const problems = checkPlugins([kraken]);

    // Then
    expect(problems).toEqual([]);
    expect(connector.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["portfolio-value", true, "wealth"],
      ["assets", false, null],
    ]);
  });

  test("given Kraken's documented example, when signed, then the API-Sign matches the documentation", async () => {
    // Given
    const nonce = "1616492376594";
    const postData = `nonce=${nonce}&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25`;

    // When
    const sign = await krakenSignature("/0/private/AddOrder", nonce, postData, SECRET);

    // Then
    expect(sign).toBe("4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==");
  });

  test("given a clock that stands still, when nonces are drawn, then they are microseconds and still increase", () => {
    // Given
    const next = nonceClock(() => NOW);

    // When
    const nonces = [next(), next(), next()];

    // Then
    expect(nonces).toEqual(["1790000000000000", "1790000000000001", "1790000000000002"]);
  });

  test("given staked, rewards and legacy balance names, when assets are counted, then each currency counts once and empty or fee balances don't", () => {
    // Given
    const balances = { ...fixture("balance").result, "DOT.F": "1.0", ADA: "0.00000000", KFEE: "1200.00", "XBT.M": "0.1" };

    // When
    const count = countAssets(balances);

    // Then
    expect(["XXBT", "ETH2.S", "USD.M", "ZEUR", "SOL"].map(assetCode)).toEqual(["BTC", "ETH", "USD", "EUR", "SOL"]);
    // USD, EUR, BTC, ETH, USDT, DAI, DOT
    expect(count).toBe(7);
  });

  test("given a key, when every metric is fetched, then the value comes from TradeBalance in dollars and the requests are signed form posts", async () => {
    // Given
    const seen: { url: string; init?: GuardedFetchInit }[] = [];
    const remember = (body: unknown) => (init: GuardedFetchInit | undefined, url: string) => {
      seen.push({ url, init });
      return body;
    };
    const ctx = fakeContext({ [`${API}/TradeBalance`]: remember(fixture("trade-balance")), [`${API}/Balance`]: remember(fixture("balance")) });
    const connector = makeKrakenConnector(() => NOW);

    // When
    const values = await connector.fetch(request(["portfolio-value", "assets"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(1101, "usd"));
    expect(values.assets).toEqual(number(7, { unit: "count" }));
    const trade = seen.find((s) => s.url.endsWith("/TradeBalance"))!;
    expect(trade.init?.method).toBe("POST");
    expect(trade.init?.body).toBe("nonce=1790000000000000&asset=ZUSD");
    expect(trade.init?.headers?.["API-Key"]).toBe(KEY);
    expect(trade.init?.headers?.["API-Sign"]).toBe(await krakenSignature("/0/private/TradeBalance", "1790000000000000", "nonce=1790000000000000&asset=ZUSD", SECRET));
    expect(new Set(["portfolio-value", "assets"].map((metric) => connector.cacheKey!({ metric, params: {} }))).size).toBe(1);
  });

  test("given only the count is wanted, when fetched, then TradeBalance isn't called", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/Balance`]: fixture("balance") });

    // When
    const values = await krakenConnector.fetch(request(["assets"]), ctx);

    // Then
    expect(values).toEqual({ assets: number(7, { unit: "count" }) });
    expect(ctx.calls).toEqual([`${API}/Balance`]);
  });

  test("given a query-only key, when connecting, then the key name labels the connection and no secret is shown", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/GetApiKeyInfo`]: keyInfo(["query-funds", "query-open-trades", "query-ledger"]), [`${API}/TradeBalance`]: fixture("trade-balance") });

    // When
    const result = await krakenConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    expect(result.secret).toEqual({ key: KEY, secret: SECRET });
    expect(result.public).toEqual({ hint: "…HsgX", name: "my-api-key" });
    expect(result.label).toBe("Kraken (my-api-key)");
    expect(result.accountId).toMatch(/^[0-9a-f]{16}$/);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(SECRET.slice(0, 12));
    expect(shown).not.toContain(KEY.slice(0, 12));
    expect(shown).not.toContain("N84G");
    expect(validateFields(krakenConnector.auth!.fields, { key: KEY, secret: SECRET }).error).toBeNull();
  });

  test("given a key that can withdraw and trade, when connecting, then it's refused naming what to remove, before reading any balance", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/GetApiKeyInfo`]: fixture("api-key-info") });

    // When
    const attempt = krakenConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("remove Withdraw Funds, Create & Modify Orders in Kraken");
    expect(ctx.calls).toEqual([`${API}/GetApiKeyInfo`]);
  });

  test("given a key without Query Funds, when connecting, then the owner is told which permission to add", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/GetApiKeyInfo`]: keyInfo(["query-ledger"]) });

    // When
    const attempt = krakenConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("Give it Query Funds.");
  });

  test("given Kraken denies TradeBalance to a Query Funds key, when connecting or fetching, then the owner is told to add Query Open Orders & Trades", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/GetApiKeyInfo`]: keyInfo(["query-funds"]), [`${API}/TradeBalance`]: refuse("EGeneral:Permission denied") });

    // When
    const connecting = krakenConnector.connect!({ key: KEY, secret: SECRET }, ctx).catch((e: unknown) => e);
    const fetching = krakenConnector.fetch(request(["portfolio-value"]), ctx).catch((e: unknown) => e);

    // Then
    for (const error of await Promise.all([connecting, fetching])) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("Query Open Orders & Trades");
    }
  });

  test("given a deleted key, a wrong private key or a shared key, when fetched, then each gets a sentence that doesn't repeat the secrets", async () => {
    // Given
    const cases = ["EAPI:Invalid key", "EAPI:Invalid signature", "EAPI:Invalid nonce"];

    // When
    const errors = await Promise.all(cases.map((e) => krakenConnector.fetch(request(["assets"]), fakeContext({ [`${API}/Balance`]: refuse(e) })).catch((error: unknown) => error)));

    // Then
    expect(errors.map((e) => (e as Error).message)).toEqual([
      "Kraken refused this API key. It may have been deleted.",
      "Kraken refused the signature, so the private key doesn't belong to this API key.",
      "Kraken refused the request order, which happens when another app uses the same key. Create a key only for Flexwall.",
    ]);
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).not.toContain(KEY.slice(-4));
      expect((error as Error).message).not.toContain(SECRET.slice(-6));
    }
  });

  test("given a private key that isn't base64, when connecting, then it's refused before any request", async () => {
    // Given
    const ctx = fakeContext({});

    // When
    const attempt = krakenConnector.connect!({ key: KEY, secret: "not base64 at all!" }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("The private key isn't valid");
    expect(ctx.calls).toEqual([]);
  });

  test("given a rate limit, a throttle or an outage, when fetched, then the error passes through", async () => {
    // Given
    const outage = new HttpError(503, `${API}/Balance`, "");
    const contexts = [
      fakeContext({ [`${API}/Balance`]: refuse("EAPI:Rate limit exceeded") }),
      fakeContext({ [`${API}/Balance`]: refuse("EService:Unavailable") }),
      fakeContext({
        [`${API}/Balance`]: () => {
          throw outage;
        },
      }),
    ];

    // When
    const errors = await Promise.all(contexts.map((ctx) => krakenConnector.fetch(request(["assets"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).not.toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toContain("EAPI:Rate limit exceeded");
    expect(errors[1]).not.toBeInstanceOf(ConnectorError);
    expect(errors[2]).toBe(outage);
  });
});
