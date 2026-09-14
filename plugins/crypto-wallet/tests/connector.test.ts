import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { cryptoWalletConnector, fromBaseUnits, MEMPOOL, normalizeAddress, PRICE, RPC } from "../src/index";

/** Real answers captured from mempool.space, PublicNode and Coinbase. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const BOTH = ["balance-usd", "balance"];
const request = (metrics: string[], chain: string, address: string) => ({ metrics, params: { chain, address }, secret: null, public: null });
const spot = (amount: string) => ({ data: { amount, base: "X", currency: "USD" } });

const GENESIS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOLANA = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg";

/** A JSON-RPC route that records what was asked and answers with `answer`. */
function rpcRoute(answer: unknown, seen: { method?: string; params?: unknown[] }[] = []) {
  return (init: GuardedFetchInit | undefined) => {
    const body = JSON.parse(init?.body ?? "{}") as { method?: string; params?: unknown[] };
    seen.push({ method: body.method, params: body.params });
    return answer;
  };
}

describe("crypto-wallet connector", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the definition, when read, then it's free, unverified, off the leaderboards, sensitive and gentle with public nodes", () => {
    // Given
    const connector = cryptoWalletConnector;

    // When
    const metrics = connector.metrics;

    // Then
    expect(connector.tier).toBe("free");
    expect(connector.verified).toBe(false);
    expect(connector.auth).toBeUndefined();
    expect(connector.ttl).toBe(1800);
    expect(metrics.map((m) => m.id)).toEqual(BOTH);
    expect(metrics.every((m) => m.sensitive === true)).toBe(true);
    expect(metrics.every((m) => m.leaderboard === undefined)).toBe(true);
    expect(connector.sample["balance-usd"]).toEqual(money(128_430, "usd"));
  });

  test("given a Bitcoin address with unconfirmed coins incoming, when fetched, then only confirmed satoshis count", async () => {
    // Given: 5,746,952,256 confirmed sats and 4,218 still in the mempool
    const ctx = fakeContext({ [`${MEMPOOL}${GENESIS}`]: fixture("mempool-address-genesis.json"), [`${PRICE}BTC-USD/spot`]: fixture("coinbase-spot-btc.json") });

    // When
    const values = await cryptoWalletConnector.fetch(request(BOTH, "bitcoin", GENESIS), ctx);

    // Then
    expect(values.balance).toEqual(number(57.46952256));
    expect(values["balance-usd"]).toEqual(money(Math.round(57.46952256 * 78555.955 * 100) / 100, "usd"));
    expect(ctx.calls).toEqual([`${MEMPOOL}${GENESIS}`, `${PRICE}BTC-USD/spot`]);
  });

  test("given a Bitcoin address that spent everything it received, when fetched, then the balance is 0, not null", async () => {
    // Given
    const emptied = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    const ctx = fakeContext({ [`${MEMPOOL}${emptied}`]: fixture("mempool-address-emptied.json"), [`${PRICE}BTC-USD/spot`]: spot("78555.955") });

    // When
    const values = await cryptoWalletConnector.fetch(request(BOTH, "bitcoin", emptied), ctx);

    // Then
    expect(values.balance).toEqual(number(0));
    expect(values["balance-usd"]).toEqual(money(0, "usd"));
  });

  test("given an Ethereum address, when the balance is fetched, then eth_getBalance is posted for the lowercase address and wei become ETH", async () => {
    // Given
    const seen: { method?: string; params?: unknown[] }[] = [];
    const ctx = fakeContext({ [RPC.ethereum]: rpcRoute(fixture("ethereum-get-balance.json"), seen) });

    // When
    const values = await cryptoWalletConnector.fetch(request(["balance"], "ethereum", VITALIK), ctx);

    // Then: 0x5d27b496af8ec430 is 6,712,532,328,902,476,848 wei
    expect(values.balance).toEqual(number(6.712532328902476848));
    expect(seen).toEqual([{ method: "eth_getBalance", params: [VITALIK.toLowerCase(), "latest"] }]);
  });

  test("given a Base address holding 1234.56789 ETH, when fetched, then no digit is lost on the way from wei", async () => {
    // Given
    const wei = 1_234_567_890_000_000_000_000n;
    const ctx = fakeContext({ [RPC.base]: { jsonrpc: "2.0", id: 1, result: `0x${wei.toString(16)}` }, [`${PRICE}ETH-USD/spot`]: spot("2000") });

    // When
    const values = await cryptoWalletConnector.fetch(request(BOTH, "base", VITALIK), ctx);

    // Then
    expect(values.balance).toEqual(number(1234.56789));
    expect(values["balance-usd"]).toEqual(money(2_469_135.78, "usd"));
    expect(ctx.calls).toEqual([RPC.base, `${PRICE}ETH-USD/spot`]);
  });

  test("given amounts too big or too small for naive division, when converted, then they keep their digits", () => {
    // Given
    const amounts = [1n, 100_000_000n, 123_456_789_012_345_678_901_234_567n];

    // When
    const coins = [fromBaseUnits(amounts[0], 18), fromBaseUnits(amounts[1], 8), fromBaseUnits(amounts[2], 18)];

    // Then
    expect(coins).toEqual([1e-18, 1, 123456789.012345678901234567]);
  });

  test("given a Solana address, when fetched, then getBalance lamports become SOL priced in dollars", async () => {
    // Given
    const seen: { method?: string; params?: unknown[] }[] = [];
    const ctx = fakeContext({ [RPC.solana]: rpcRoute(fixture("solana-get-balance.json"), seen), [`${PRICE}SOL-USD/spot`]: spot("102.855") });

    // When
    const values = await cryptoWalletConnector.fetch(request(BOTH, "solana", SOLANA), ctx);

    // Then: 39,869,364 lamports
    expect(values.balance).toEqual(number(0.039869364));
    expect(values["balance-usd"]).toEqual(money(4.1, "usd"));
    expect(seen).toEqual([{ method: "getBalance", params: [SOLANA] }]);
  });

  test("given a Solana address nobody ever funded, when fetched, then the balance is 0, not null", async () => {
    // Given
    const fresh = "CKswF7fJLnfwKXrVJx6CWLh2Q6PUT62So3UZA1seBFj8";
    const ctx = fakeContext({ [RPC.solana]: fixture("solana-get-balance-empty.json") });

    // When
    const values = await cryptoWalletConnector.fetch(request(["balance"], "solana", fresh), ctx);

    // Then
    expect(values.balance).toEqual(number(0));
  });

  test("given only a balance tile, when fetched, then the price API isn't called and no dollar value is made up", async () => {
    // Given
    const ctx = fakeContext({ [`${MEMPOOL}${GENESIS}`]: fixture("mempool-address-genesis.json") });

    // When
    const values = await cryptoWalletConnector.fetch(request(["balance"], "bitcoin", GENESIS), ctx);

    // Then
    expect(ctx.calls).toEqual([`${MEMPOOL}${GENESIS}`]);
    expect(Object.keys(values)).toEqual(["balance"]);
  });

  test("given a dollar tile and a Coinbase outage, when fetched, then the error goes through so the last good value stays", async () => {
    // Given
    const outage = new HttpError(503, `${PRICE}ETH-USD/spot`, "");
    const ctx = fakeContext({
      [RPC.ethereum]: fixture("ethereum-get-balance.json"),
      [PRICE]: () => {
        throw outage;
      },
    });

    // When
    const attempt = cryptoWalletConnector.fetch(request(BOTH, "ethereum", VITALIK), ctx);

    // Then
    await expect(attempt).rejects.toBe(outage);
  });

  test("given addresses pasted on the wrong chain, when fetched, then the owner is told before any request", async () => {
    // Given
    const mismatches = [
      ["bitcoin", VITALIK],
      ["bitcoin", SOLANA],
      ["ethereum", GENESIS],
      ["base", SOLANA],
      ["solana", VITALIK],
      ["solana", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"],
    ];
    const ctx = fakeContext({});

    // When
    const errors = await Promise.all(mismatches.map(([chain, address]) => cryptoWalletConnector.fetch(request(["balance"], chain, address), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors.every((e) => e instanceof ConnectorError)).toBe(true);
    expect((errors[0] as Error).message).toBe(`${VITALIK} isn't a Bitcoin address.`);
    expect((errors[4] as Error).message).toBe(`${VITALIK} isn't a Solana address.`);
    expect(ctx.calls).toEqual([]);
  });

  test("given a Bitcoin legacy address on Solana, which looks like base58, when the node refuses it, then the owner gets a sentence", async () => {
    // Given
    const ctx = fakeContext({ [RPC.solana]: fixture("solana-wrong-size.json") });

    // When
    const attempt = cryptoWalletConnector.fetch(request(["balance"], "solana", GENESIS), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
    await expect(attempt).rejects.toThrow(`${GENESIS} isn't a valid Solana address.`);
  });

  test("given an invalid argument from an EVM node, when fetched, then it becomes a sentence for the owner", async () => {
    // Given
    const ctx = fakeContext({ [RPC.ethereum]: fixture("ethereum-invalid-argument.json") });

    // When
    const attempt = cryptoWalletConnector.fetch(request(["balance"], "ethereum", VITALIK), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });

  test("given a JSON-RPC rate limit answered with HTTP 200, when fetched, then it goes through as a plain error", async () => {
    // Given
    const ctx = fakeContext({ [RPC.solana]: { jsonrpc: "2.0", id: 1, error: { code: -32005, message: "Too many requests" } } });

    // When
    const error = await cryptoWalletConnector.fetch(request(["balance"], "solana", SOLANA), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConnectorError);
  });

  test("given addresses mempool.space refuses, when fetched, then a bad checksum and a testnet address get their own sentences", async () => {
    // Given
    const refuse = (text: string) => () => {
      throw new HttpError(400, MEMPOOL, text);
    };
    const bad = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb";

    // When
    const checksum = await cryptoWalletConnector.fetch(request(["balance"], "bitcoin", bad), fakeContext({ [MEMPOOL]: refuse("Invalid Bitcoin address") })).catch((e: unknown) => e);
    const testnet = await cryptoWalletConnector.fetch(request(["balance"], "bitcoin", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), fakeContext({ [MEMPOOL]: refuse("Address on invalid network") })).catch((e: unknown) => e);

    // Then
    expect(checksum).toBeInstanceOf(ConnectorError);
    expect((checksum as Error).message).toBe(`${bad} isn't a valid Bitcoin address.`);
    expect((testnet as Error).message).toBe("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy isn't a Bitcoin mainnet address.");
  });

  test("given mempool.space rate limiting, when fetched, then the error goes through untouched", async () => {
    // Given
    const limited = new HttpError(429, `${MEMPOOL}${GENESIS}`, "");
    const ctx = fakeContext({
      [MEMPOOL]: () => {
        throw limited;
      },
    });

    // When
    const attempt = cryptoWalletConnector.fetch(request(["balance"], "bitcoin", GENESIS), ctx);

    // Then
    await expect(attempt).rejects.toBe(limited);
  });

  test("given every address form people paste, when the field is validated, then real addresses pass and the rest get a sentence", () => {
    // Given
    const params = cryptoWalletConnector.metrics[0].params!;
    const real = [
      GENESIS, // legacy P2PKH
      "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", // P2SH
      "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", // bech32 P2WPKH
      "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", // bech32 P2WSH
      "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", // bech32 uppercase
      "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297", // taproot
      VITALIK,
      VITALIK.toLowerCase(),
      SOLANA,
      "11111111111111111111111111111112",
    ];
    const fake = ["", "hello", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604", "bc1qXy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl", "https://etherscan.io/address/0xd8da6bf26964af9d7eed9e03e53415d37aa96045"];

    // When
    const accepted = real.map((address) => validateFields(params, { chain: "bitcoin", address }).error);
    const refused = fake.map((address) => validateFields(params, { chain: "bitcoin", address }).error);

    // Then
    expect(accepted).toEqual(real.map(() => null));
    expect(refused.every((error) => typeof error === "string")).toBe(true);
    expect(refused[1]).toBe("Address isn't a Bitcoin, EVM or Solana address.");
  });

  test("given spellings of the same address, when grouped, then case-insensitive forms share a request and base58 keeps its case", () => {
    // Given
    const key = (chain: string, address: string, metric = "balance") => cryptoWalletConnector.cacheKey!({ metric, params: { chain, address } });

    // When / Then
    expect(key("ethereum", VITALIK, "balance-usd")).toBe(key("ethereum", VITALIK.toLowerCase()));
    expect(key("base", VITALIK)).not.toBe(key("ethereum", VITALIK));
    expect(key("bitcoin", "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toBe(key("bitcoin", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"));
    expect(key("solana", SOLANA)).not.toBe(key("solana", SOLANA.toLowerCase()));
    expect(normalizeAddress("bitcoin", ` ${GENESIS} `)).toBe(GENESIS);
  });

  test("given an uppercase bech32 address, when fetched, then mempool.space is asked for the lowercase form", async () => {
    // Given
    const lower = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    const ctx = fakeContext({ [`${MEMPOOL}${lower}`]: fixture("mempool-address-emptied.json") });

    // When
    await cryptoWalletConnector.fetch(request(["balance"], "bitcoin", lower.toUpperCase()), ctx);

    // Then
    expect(ctx.calls).toEqual([`${MEMPOOL}${lower}`]);
  });
});
