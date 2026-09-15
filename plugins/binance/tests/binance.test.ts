import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import binance, { binanceConnector, binanceSignature, countAssets, makeBinanceConnector, signedQuery, totalInBtc, type WalletBalance } from "../src/index";

/** Responses copied from the examples in Binance's API documentation. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.binance.com";
/** The example key pair from Binance's SIGNED request documentation. */
const KEY = "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A";
const SECRET = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j";
const NOW = 1_790_000_000_123;
const request = (metrics: string[]) => ({ metrics, params: {}, secret: { key: KEY, secret: SECRET }, public: null });

/** The documented key permissions, turned into a reading-only key unless a test says otherwise. */
function restrictions(over: Record<string, boolean> = {}) {
  return { ...fixture("api-restrictions"), enableInternalTransfer: false, permitsUniversalTransfer: false, enablePortfolioMarginTrading: false, ...over };
}

const wallets = (): WalletBalance[] => [
  { activate: true, balance: "0.5", walletName: "Spot", assetBalances: [{ asset: "BTC", free: "0.4", locked: "0.1", freeze: "0", withdrawing: "0" }, { asset: "DUST", free: "0", locked: "0" }] },
  { activate: true, balance: "0.25", walletName: "Earn", assetBalances: [{ asset: "ETH", free: "0", locked: "3", freeze: "0", withdrawing: "0" }, { asset: "btc", free: "0.01" }] },
  { activate: true, balance: "0.25", walletName: "Funding", assetBalances: [{ asset: "USDT", free: "0", locked: "0", freeze: "0", withdrawing: "25000" }] },
  { activate: false, balance: "0", walletName: "Options" },
];

const refuse = (status: number, body: object | string) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, typeof body === "string" ? body : JSON.stringify(body));
};

describe("binance plugin", () => {
  test("given the plugin, when checked, then it has no problems and only the value is sensitive", () => {
    // Given
    const connector = binance.connectors![0];

    // When
    const problems = checkPlugins([binance]);

    // Then
    expect(problems).toEqual([]);
    expect(connector.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["portfolio-value", true, "wealth"],
      ["assets", false, null],
    ]);
  });

  test("given Binance's two documented HMAC examples, when the query is built and signed, then both signatures match the documentation", async () => {
    // Given
    const order = { side: "BUY", type: "LIMIT", timeInForce: "GTC", quantity: "1", price: "0.1" };
    const ascii = signedQuery({ symbol: "LTCBTC", ...order }, 1499827319559);
    const unicode = signedQuery({ symbol: "１２３４５６", ...order }, 1499827319559);

    // When
    const signatures = await Promise.all([binanceSignature(ascii, SECRET), binanceSignature(unicode, SECRET)]);

    // Then
    expect(ascii).toBe("symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559");
    expect(unicode).toBe("symbol=%EF%BC%91%EF%BC%92%EF%BC%93%EF%BC%94%EF%BC%95%EF%BC%96&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559");
    expect(signatures).toEqual(["c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71", "e1353ec6b14d888f1164ae9af8228a3dbd508bc82eb867db8ab6046442f33ef3"]);
  });

  test("given wallets with detail, when totalled and counted, then every wallet adds up and each positive asset counts once", () => {
    // Given
    const list = wallets();

    // When
    const btc = totalInBtc(list);
    const count = countAssets(list);

    // Then
    expect(btc).toBe(1);
    // BTC (spot and earn), ETH (locked in earn), USDT (withdrawing)
    expect(count).toBe(3);
    expect(countAssets([{ activate: true, balance: "1", walletName: "Spot" }])).toBeNull();
    expect(countAssets(fixture("wallet-balance"))).toBe(1);
  });

  test("given a key, when every metric is fetched, then wallets valued in BTC are converted at the BTCUSDT price and the request is signed", async () => {
    // Given
    let apiKey: string | undefined;
    const ctx = fakeContext({
      [`${API}/sapi/v1/asset/wallet/balance`]: (init) => {
        apiKey = init?.headers?.["X-MBX-APIKEY"];
        return wallets();
      },
      [`${API}/api/v3/ticker/price`]: { symbol: "BTCUSDT", price: "64250.50000000" },
    });
    const connector = makeBinanceConnector(() => NOW);

    // When
    const values = await connector.fetch(request(["portfolio-value", "assets"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(64251, "usd"));
    expect(values.assets).toEqual(number(3, { unit: "count" }));
    const query = "needBalanceDetail=true&recvWindow=5000&timestamp=1790000000123";
    expect(ctx.calls).toEqual([`${API}/sapi/v1/asset/wallet/balance?${query}&signature=${await binanceSignature(query, SECRET)}`, `${API}/api/v3/ticker/price?symbol=BTCUSDT`]);
    expect(apiKey).toBe(KEY);
    expect(new Set(["portfolio-value", "assets"].map((metric) => connector.cacheKey!({ metric, params: {} }))).size).toBe(1);
  });

  test("given only the value is wanted, when fetched, then no balance detail is asked for", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/sapi/v1/asset/wallet/balance`]: wallets(), [`${API}/api/v3/ticker/price`]: { symbol: "BTCUSDT", price: "100" } });

    // When
    const values = await binanceConnector.fetch(request(["portfolio-value"]), ctx);

    // Then
    expect(values).toEqual({ "portfolio-value": money(100, "usd") });
    expect(ctx.calls[0]).not.toContain("needBalanceDetail");
  });

  test("given a reading-only key, when connecting, then the account id comes back and no secret is shown", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/sapi/v1/account/apiRestrictions`]: restrictions(), [`${API}/api/v3/account`]: fixture("account") });

    // When
    const result = await binanceConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    expect(result).toEqual({ secret: { key: KEY, secret: SECRET }, public: { hint: "…Eh8A" }, label: "Binance", accountId: "354937868" });
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(SECRET.slice(-4));
    expect(shown).not.toContain(KEY.slice(0, 12));
    expect(ctx.calls[1]).toContain("omitZeroBalances=true");
    expect(validateFields(binanceConnector.auth!.fields, { key: KEY, secret: SECRET }).error).toBeNull();
    expect(validateFields(binanceConnector.auth!.fields, { key: KEY, secret: "-----BEGIN PRIVATE KEY-----" }).error).toContain("HMAC");
  });

  test("given the documented key that may transfer, when connecting, then it's refused naming each permission to turn off", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/sapi/v1/account/apiRestrictions`]: fixture("api-restrictions") });

    // When
    const attempt = binanceConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("turn off Enable Portfolio Margin Trading, Enable Internal Transfer, Permits Universal Transfer in Binance");
    expect(ctx.calls).toHaveLength(1);
  });

  test("given keys that can trade or withdraw, when connecting, then each is refused", async () => {
    // Given
    const over: Record<string, boolean>[] = [{ enableSpotAndMarginTrading: true }, { enableWithdrawals: true }, { enableFutures: true }, { enableMargin: true }];

    // When
    const errors = await Promise.all(over.map((o) => binanceConnector.connect!({ key: KEY, secret: SECRET }, fakeContext({ [`${API}/sapi/v1/account/apiRestrictions`]: restrictions(o) })).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as Error).message.match(/turn off (.*) in Binance/)?.[1])).toEqual(["Enable Spot & Margin Trading", "Enable Withdrawals", "Enable Futures", "Enable Margin Loan, Repay & Transfer"]);
    for (const error of errors) expect(error).toBeInstanceOf(ConnectorError);
  });

  test("given a key that can't read, when connecting, then the owner is told to turn reading on", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/sapi/v1/account/apiRestrictions`]: restrictions({ enableReading: false }) });

    // When
    const attempt = binanceConnector.connect!({ key: KEY, secret: SECRET }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("Turn on Enable Reading");
  });

  test("given a rejected key or a wrong secret, when connecting or fetching, then the owner gets a sentence that doesn't repeat the secrets", async () => {
    // Given
    const rejected = fakeContext({ [`${API}/sapi/v1/`]: refuse(401, { code: -2015, msg: "Invalid API-key, IP, or permissions for action." }) });
    const badSignature = fakeContext({ [`${API}/sapi/v1/`]: refuse(400, { code: -1022, msg: "Signature for this request is not valid." }) });

    // When
    const errors = await Promise.all([
      binanceConnector.connect!({ key: KEY, secret: SECRET }, rejected).catch((e: unknown) => e),
      binanceConnector.fetch(request(["assets"]), rejected).catch((e: unknown) => e),
      binanceConnector.fetch(request(["assets"]), badSignature).catch((e: unknown) => e),
    ]);

    // Then
    expect((errors[0] as Error).message).toContain("refused this API key");
    expect((errors[1] as Error).message).toContain("IP restriction");
    expect((errors[2] as Error).message).toContain("secret key doesn't belong");
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).not.toContain(KEY.slice(-4));
      expect((error as Error).message).not.toContain(SECRET.slice(-4));
    }
  });

  test("given Binance refuses this server's country or firewall-blocks it, when fetched, then the error passes through and is logged", async () => {
    // Given
    const geo = fakeContext({ [`${API}/sapi/v1/`]: refuse(451, { code: 0, msg: "Service unavailable from a restricted location" }) });
    const waf = fakeContext({ [`${API}/sapi/v1/`]: refuse(403, "<html>403 Forbidden</html>") });
    const logs: string[] = [];
    geo.log = waf.log = (line) => logs.push(line);

    // When
    const errors = await Promise.all([geo, waf].map((ctx) => binanceConnector.fetch(request(["assets"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as HttpError).status)).toEqual([451, 403]);
    for (const error of errors) expect(error).not.toBeInstanceOf(ConnectorError);
    expect(logs).toHaveLength(2);
    expect(logs.join(" ")).not.toContain(KEY);
  });

  test("given a rate limit, a clock outside the window or an outage, when fetched, then the error passes through", async () => {
    // Given
    const cases = [refuse(429, { code: -1003, msg: "Too many requests" }), refuse(400, { code: -1021, msg: "Timestamp for this request is outside of the recvWindow." }), refuse(503, "")];

    // When
    const errors = await Promise.all(cases.map((route) => binanceConnector.fetch(request(["assets"]), fakeContext({ [`${API}/sapi/v1/`]: route })).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as HttpError).status)).toEqual([429, 400, 503]);
    for (const error of errors) expect(error).not.toBeInstanceOf(ConnectorError);
  });
});
