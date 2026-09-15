import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import coinbase, { coinbaseConnector, coinbaseJwt, countAssets, importPrivateKey, jwtUri, makeCoinbaseConnector, privateKeyDer, sec1ToPkcs8, totalValue, type Breakdown } from "../src/index";

/**
 * Coinbase's reference gives schemas but no example responses: the JSON
 * fixtures follow the schemas. Keys are generated when the tests start, so the
 * repository holds no private key: the P-256 pair is laid out the way
 * `openssl ecparam -genkey` writes SEC1 and `openssl pkcs8 -topk8` writes PKCS#8.
 */
const file = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fixture = (name: string) => JSON.parse(file(`${name}.json`));

const API = "https://api.coinbase.com/api/v3/brokerage";
const KEY_NAME = "organizations/5d8a7c3e-1b2f-4e6d-9a0c-7f3b2e1d4c5a/apiKeys/9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const NOW = 1_790_000_000_500;
const DEFAULT = "6b0a3f2c-8f3e-4a8b-9d6a-1d2e3f4a5b6c";
const LONG_TERM = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const pem = (label: string, bytes: Uint8Array) => `-----BEGIN ${label}-----\n${toBase64(bytes).match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64(part)));

const P256_OID = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const EC_PUBLIC_KEY_OID = [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];

const ecPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
const jwk = await crypto.subtle.exportKey("jwk", ecPair.privateKey);
const [d, x, y] = [jwk.d!, jwk.x!, jwk.y!].map(fromBase64);
/** ECPrivateKey with curve parameters and public key, as openssl writes it: 121 bytes. */
const SEC1 = Uint8Array.from([0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20, ...d, 0xa0, 0x0a, ...P256_OID, 0xa1, 0x44, 0x03, 0x42, 0x00, 0x04, ...x, ...y]);
/** The same key after `openssl pkcs8 -topk8`: parameters move to the algorithm identifier. */
const PKCS8 = Uint8Array.from([0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, ...EC_PUBLIC_KEY_OID, ...P256_OID, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20, ...d, 0xa1, 0x44, 0x03, 0x42, 0x00, 0x04, ...x, ...y]);
const PEM = pem("EC PRIVATE KEY", SEC1);
const edPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
const ED25519_PEM = pem("PRIVATE KEY", new Uint8Array(await crypto.subtle.exportKey("pkcs8", edPair.privateKey)));

const request = (metrics: string[]) => ({ metrics, params: {}, secret: { keyName: KEY_NAME, privateKey: PEM }, public: null });

async function verifies(jwt: string): Promise<boolean> {
  const [header, payload, signature] = jwt.split(".");
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ecPair.publicKey, fromBase64(signature) as Uint8Array<ArrayBuffer>, new TextEncoder().encode(`${header}.${payload}`));
}

/** The schema-shaped breakdown, with a total and positions a test is about. */
function aBreakdown(total: string, assets: [string, number][], currency = "USD") {
  const body = fixture("breakdown");
  body.breakdown.portfolio_balances.total_balance = { value: total, currency };
  body.breakdown.spot_positions = assets.map(([asset, crypto]) => ({ asset, total_balance_crypto: crypto, total_balance_fiat: crypto }));
  return body;
}

const refuse = (status: number) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify({ error: status === 401 ? "UNAUTHORIZED" : "PERMISSION_DENIED", message: "refused" }));
};

describe("coinbase plugin", () => {
  test("given the plugin, when checked, then it has no problems and only the value is sensitive", () => {
    // Given
    const connector = coinbase.connectors![0];

    // When
    const problems = checkPlugins([coinbase]);

    // Then
    expect(problems).toEqual([]);
    expect(connector.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["portfolio-value", true, "wealth"],
      ["assets", false, null],
    ]);
  });

  test("given a SEC1 EC private key, when rewrapped, then it's byte for byte what openssl pkcs8 -topk8 makes", () => {
    // Given
    const sec1 = fromBase64(PEM.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));

    // When
    const pkcs8 = sec1ToPkcs8(sec1);

    // Then
    expect(sec1.length).toBe(121);
    expect(pkcs8.length).toBe(138);
    expect([...pkcs8]).toEqual([...PKCS8]);
  });

  test("given the key pasted with newlines, with \\n escapes, without newlines or as PKCS#8, when read, then each gives the same key", () => {
    // Given
    const escaped = PEM.trim().replace(/\n/g, "\\n");
    const flat = PEM.replace(/\n/g, "");
    const pkcs8 = pem("PRIVATE KEY", PKCS8);

    // When
    const ders = [PEM, escaped, flat, pkcs8].map((k) => [...privateKeyDer(k)]);

    // Then
    for (const der of ders) expect(der).toEqual(ders[0]);
  });

  test("given a JWT signed with the rewrapped key, when checked with the public key, then it verifies and carries Coinbase's claims", async () => {
    // Given
    const key = await importPrivateKey(PEM);
    const uri = jwtUri("GET", "/api/v3/brokerage/portfolios/abc?currency=USD");

    // When
    const jwt = await coinbaseJwt({ keyName: KEY_NAME, key, uri, nowSeconds: NOW / 1000, nonce: "00ff" });

    // Then
    const [header, payload] = jwt.split(".");
    expect(decode(header)).toEqual({ alg: "ES256", kid: KEY_NAME, nonce: "00ff", typ: "JWT" });
    expect(decode(payload)).toEqual({ sub: KEY_NAME, iss: "cdp", nbf: 1_790_000_000, exp: 1_790_000_120, uri: "GET api.coinbase.com/api/v3/brokerage/portfolios/abc" });
    expect(jwt).not.toContain("=");
    expect(await verifies(jwt)).toBe(true);
  });

  test("given Ed25519 keys as a PEM or as CDP's bare base64, when connecting, then they're refused before any request", async () => {
    // Given
    const ctx = fakeContext({});
    const bare = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(64))));

    // When
    const errors = await Promise.all([ED25519_PEM, bare].map((privateKey) => coinbaseConnector.connect!({ keyName: KEY_NAME, privateKey }, ctx).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("only accepts ECDSA keys");
    }
    expect(ctx.calls).toEqual([]);
  });

  test("given breakdowns, when totalled and counted, then totals add up, empty positions don't count and another currency is refused", () => {
    // Given
    const breakdowns: Breakdown[] = [aBreakdown("100.25", [["BTC", 0.1], ["USD", 50], ["SOL", 0]]).breakdown, aBreakdown("50.5", [["btc", 0.2], ["ETH", 1]]).breakdown];

    // When
    const total = totalValue(breakdowns);
    const count = countAssets(breakdowns);

    // Then
    expect(total).toBe(150.75);
    expect(count).toBe(3);
    expect(countAssets([fixture("breakdown").breakdown])).toBe(3);
    expect(() => totalValue([aBreakdown("1", [], "EUR").breakdown])).toThrow("EUR");
  });

  test("given two live portfolios and a deleted one, when every metric is fetched, then live ones are summed in dollars with a fresh JWT per request", async () => {
    // Given
    const jwts: string[] = [];
    const bearer = (body: unknown) => (init: GuardedFetchInit | undefined) => {
      jwts.push(String(init?.headers?.Authorization).replace("Bearer ", ""));
      return body;
    };
    const ctx = fakeContext({
      [`${API}/portfolios`]: bearer(fixture("portfolios")),
      [`${API}/portfolios/${DEFAULT}`]: bearer(fixture("breakdown")),
      [`${API}/portfolios/${LONG_TERM}`]: bearer(aBreakdown("1000.13", [["BTC", 0.01], ["DOGE", 1000]])),
    });
    let nonces = 0;
    const connector = makeCoinbaseConnector({ now: () => NOW, nonce: () => `n${++nonces}` });

    // When
    const values = await connector.fetch(request(["portfolio-value", "assets"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(26432, "usd"));
    expect(values.assets).toEqual(number(4, { unit: "count" }));
    // Breakdowns are fetched in parallel: which one leaves first isn't part of the contract.
    expect(ctx.calls[0]).toBe(`${API}/portfolios`);
    expect([...ctx.calls.slice(1)].sort()).toEqual([`${API}/portfolios/${DEFAULT}?currency=USD`, `${API}/portfolios/${LONG_TERM}?currency=USD`].sort());
    // Signed JWTs leave in whatever order the parallel reads start: a fresh nonce each, one per URI.
    expect(jwts.map((j) => decode(j.split(".")[0]).nonce).sort()).toEqual(["n1", "n2", "n3"]);
    expect(jwts.map((j) => decode(j.split(".")[1]).uri)).toContain(`GET api.coinbase.com/api/v3/brokerage/portfolios/${DEFAULT}`);
    for (const jwt of jwts) expect(await verifies(jwt)).toBe(true);
    expect(new Set(["portfolio-value", "assets"].map((metric) => connector.cacheKey!({ metric, params: {} }))).size).toBe(1);
  });

  test("given a key restricted to one portfolio, when fetched, then portfolios it can't read are skipped", async () => {
    // Given
    const ctx = fakeContext({
      [`${API}/portfolios`]: fixture("portfolios"),
      [`${API}/portfolios/${DEFAULT}`]: fixture("breakdown"),
      [`${API}/portfolios/${LONG_TERM}`]: refuse(403),
    });

    // When
    const values = await coinbaseConnector.fetch(request(["portfolio-value"]), ctx);

    // Then
    expect(values).toEqual({ "portfolio-value": money(25432, "usd") });
  });

  test("given a view-only key, when connecting, then its portfolio labels the connection and nothing secret is shown", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/key_permissions`]: fixture("key-permissions"), [`${API}/portfolios`]: fixture("portfolios") });

    // When
    const result = await coinbaseConnector.connect!({ keyName: KEY_NAME, privateKey: PEM }, ctx);

    // Then
    expect(result).toEqual({
      secret: { keyName: KEY_NAME, privateKey: PEM.trim() },
      public: { hint: "…7c6d", portfolio: "Default" },
      label: "Coinbase (Default)",
      accountId: DEFAULT,
    });
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    const body = PEM.split("\n")[1];
    expect(shown).not.toContain(body.slice(0, 16));
    expect(shown).not.toContain(KEY_NAME);
    expect(validateFields(coinbaseConnector.auth!.fields, { keyName: KEY_NAME, privateKey: PEM }).error).toBeNull();
  });

  test("given keys that can trade or transfer, when connecting, then they're refused naming what to leave out", async () => {
    // Given
    const withPermissions = (over: object) => fakeContext({ [`${API}/key_permissions`]: { ...fixture("key-permissions"), ...over } });

    // When
    const errors = await Promise.all(
      [{ can_trade: true }, { can_transfer: true }, { can_trade: true, can_transfer: true }].map((over) =>
        coinbaseConnector.connect!({ keyName: KEY_NAME, privateKey: PEM }, withPermissions(over)).catch((e: unknown) => e)
      )
    );

    // Then
    expect(errors.map((e) => (e as Error).message)).toEqual([
      "This key can do more than view: create a key with View only, without Trade.",
      "This key can do more than view: create a key with View only, without Transfer.",
      "This key can do more than view: create a key with View only, without Trade or Transfer.",
    ]);
    for (const error of errors) expect(error).toBeInstanceOf(ConnectorError);
  });

  test("given a key that can't view, when connecting, then the owner is told to add View", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/key_permissions`]: { ...fixture("key-permissions"), can_view: false } });

    // When
    const attempt = coinbaseConnector.connect!({ keyName: KEY_NAME, privateKey: PEM }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("View permission");
  });

  test("given a refused or forbidden key, when connecting or fetching, then the owner gets a sentence that doesn't repeat the key", async () => {
    // Given
    const unauthorized = fakeContext({ [API]: refuse(401) });
    const forbidden = fakeContext({ [API]: refuse(403) });

    // When
    const errors = await Promise.all([
      coinbaseConnector.connect!({ keyName: KEY_NAME, privateKey: PEM }, unauthorized).catch((e: unknown) => e),
      coinbaseConnector.fetch(request(["assets"]), unauthorized).catch((e: unknown) => e),
      coinbaseConnector.fetch(request(["assets"]), forbidden).catch((e: unknown) => e),
    ]);

    // Then
    expect((errors[0] as Error).message).toContain("refused this API key");
    expect((errors[1] as Error).message).toContain("refused this API key");
    expect((errors[2] as Error).message).toContain("View permission");
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).not.toContain(KEY_NAME.slice(-12));
      expect((error as Error).message).not.toContain(PEM.split("\n")[1].slice(0, 16));
    }
  });

  test("given a rate limit or an outage, when fetched, then the error passes through", async () => {
    // Given
    const cases = [429, 503].map((status) => fakeContext({ [API]: refuse(status) }));

    // When
    const errors = await Promise.all(cases.map((ctx) => coinbaseConnector.fetch(request(["assets"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as HttpError).status)).toEqual([429, 503]);
    for (const error of errors) expect(error).not.toBeInstanceOf(ConnectorError);
  });
});
