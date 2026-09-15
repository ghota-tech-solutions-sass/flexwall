import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, type ConnectorDef, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { API, canonicalJson, makeSnaptradeConnector, MAX_ACCOUNTS, snaptradeConnector, snaptradeSignature, sumInLargestCurrency, type Account, type Connection } from "../src/index";

/**
 * Fixtures are the examples of SnapTrade's API reference (docs.snaptrade.com),
 * trimmed; tests add accounts and currencies where they need them. SnapTrade
 * publishes no signature value to check against, so signatures are recomputed
 * here with a second HMAC implementation over the canonical string its guide
 * prints.
 */
const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const NOW = Date.parse("2026-09-15T08:00:00Z");
const TS = String(NOW / 1000);
const CLIENT_ID = "FLEXWALL-TEST";
const CONSUMER_KEY = "c0nsumerKeyThatMustNeverLeak0000000000000000000000";
const ENV = { SNAPTRADE_CLIENT_ID: CLIENT_ID, SNAPTRADE_CONSUMER_KEY: CONSUMER_KEY };
const USER_ID = "flexwall-7d3c1f0e-2b4a-4c8e-9f1d-5a6b7c8d9e0f";
const USER_SECRET = "adf2aa34-8219-40f7-a6b3-60156985cc61";
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const STATE = "3a57e2d3-2e0c-4336-af9b-7fa94f0606a3";
const ROBINHOOD_ACCOUNT = "917c8734-8470-4a3e-a18f-57c3f2ee6631";

const connector: ConnectorDef = makeSnaptradeConnector({ now: () => NOW, newUserId: () => USER_ID });
const oauth = connector.auth!.oauth!;

const userQuery = `clientId=${CLIENT_ID}&timestamp=${TS}&userId=${USER_ID}&userSecret=${USER_SECRET}`;
const hmac = (message: string) => createHmac("sha256", CONSUMER_KEY).update(message).digest("base64");
const secret = { userId: USER_ID, userSecret: USER_SECRET };
const request = (metrics: string[]) => ({ metrics, params: {}, secret, public: { brokerages: "Robinhood", accounts: "1" } });

const refuse = (status: number, body: Record<string, unknown>) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify(body));
};

const account = (over: Partial<Account> & { id: string; amount?: number | null; currency?: string }): Account => {
  const { amount = 1000, currency = "USD", ...rest } = over;
  return { ...fixture<Account[]>("accounts")[0], balance: { total: amount === null ? null : { amount, currency } }, ...rest };
};
const connection = (over: Partial<Connection> & { name?: string } = {}): Connection => {
  const base = fixture<Connection[]>("authorizations")[0];
  const { name, ...rest } = over;
  return { ...base, ...(name ? { brokerage: { ...base.brokerage, name, display_name: name } } : {}), ...rest };
};

/** Routes for a user whose connections, accounts and balances answer as given. */
function userRoutes(opts: { connections?: Connection[]; accounts?: Account[]; balances?: Record<string, unknown> } = {}) {
  return {
    [`${API}/authorizations?`]: opts.connections ?? fixture<Connection[]>("authorizations"),
    [`${API}/accounts?`]: opts.accounts ?? fixture<Account[]>("accounts"),
    [`${API}/accounts/`]: (_init: GuardedFetchInit | undefined, url: string) => {
      const id = decodeURIComponent(new URL(url).pathname.split("/")[2]);
      return (opts.balances ?? { [ROBINHOOD_ACCOUNT]: fixture("balances") })[id] ?? [];
    },
  };
}

describe("snaptrade plugin", () => {
  test("given the plugin, when checked, then it has no problems, signs in through oauth without connect or refresh, and money metrics are sensitive", () => {
    // Given
    const def = plugin.connectors![0];

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
    expect(def).toBe(snaptradeConnector);
    expect(def.connect).toBeUndefined();
    expect(def.auth?.oauth?.refresh).toBeUndefined();
    expect(def.auth?.fields).toEqual([]);
    expect(def.auth?.label).toBe("Connect a brokerage");
    expect([def.tier, def.verified]).toEqual(["pro", true]);
    expect(def.ttl).toBeGreaterThanOrEqual(6 * 3600);
    expect(def.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["portfolio-value", true, "wealth"],
      ["cash", true, null],
      ["accounts", false, null],
    ]);
    expect(new Set(def.metrics.map((m) => def.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
    expect(plugin.author).toEqual({ name: "Flexwall", url: "https://flexwall.lol" });
  });
});

describe("signing", () => {
  test("given the payload of SnapTrade's signing guide, when made canonical, then it is byte for byte the string the guide prints", () => {
    // Given
    const payload = { query: "clientId=YOUR_CLIENT_ID&timestamp=1715123456", path: "/api/v1/symbols", content: { substring: "AAPL" } };

    // When
    const canonical = canonicalJson(payload);

    // Then
    expect(canonical).toBe('{"content":{"substring":"AAPL"},"path":"/api/v1/symbols","query":"clientId=YOUR_CLIENT_ID&timestamp=1715123456"}');
  });

  test("given nested objects and arrays, when made canonical, then keys are sorted at every level and array order is kept", () => {
    // Given
    const value = { b: [{ z: 1, a: null }, "x"], a: { d: true, c: "é" }, skipped: undefined };

    // When
    const canonical = canonicalJson(value);

    // Then
    expect(canonical).toBe('{"a":{"c":"é","d":true},"b":[{"a":null,"z":1},"x"]}');
  });

  test("given the guide's example request, when signed, then the header is base64 HMAC-SHA256 of the canonical string, keyed with the consumer key", async () => {
    // Given
    const canonical = '{"content":{"substring":"AAPL"},"path":"/api/v1/symbols","query":"clientId=YOUR_CLIENT_ID&timestamp=1715123456"}';

    // When
    const signature = await snaptradeSignature("YOUR_CONSUMER_KEY", { content: { substring: "AAPL" }, path: "/api/v1/symbols", query: "clientId=YOUR_CLIENT_ID&timestamp=1715123456" });

    // Then
    expect(signature).toBe(createHmac("sha256", "YOUR_CONSUMER_KEY").update(canonical).digest("base64"));
  });

  test("given a request without a body, when signed, then content is null", async () => {
    // Given
    const query = "clientId=A&timestamp=1";

    // When
    const signature = await snaptradeSignature(CONSUMER_KEY, { content: null, path: "/accounts", query });

    // Then
    expect(signature).toBe(hmac(`{"content":null,"path":"/accounts","query":"${query}"}`));
  });
});

describe("authorize", () => {
  test("given a server app, when authorizing, then a new user is registered, a read-only portal link is made for it, and the secret only travels in carry", async () => {
    // Given
    const sent: { url: string; init: GuardedFetchInit | undefined }[] = [];
    const ctx = fakeContext(
      {
        [`${API}/snapTrade/registerUser`]: (init, url) => {
          sent.push({ url, init });
          return fixture("register-user");
        },
        [`${API}/snapTrade/login`]: (init, url) => {
          sent.push({ url, init });
          return fixture("login");
        },
      },
      { env: ENV }
    );

    // When
    const started = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    const [register, login] = sent;
    const registerQuery = `clientId=${CLIENT_ID}&timestamp=${TS}`;
    expect(register.url).toBe(`${API}/snapTrade/registerUser?${registerQuery}`);
    expect(register.init?.method).toBe("POST");
    expect(register.init?.body).toBe(`{"userId":"${USER_ID}"}`);
    expect(register.init?.headers?.Signature).toBe(hmac(`{"content":{"userId":"${USER_ID}"},"path":"/snapTrade/registerUser","query":"${registerQuery}"}`));

    expect(login.url).toBe(`${API}/snapTrade/login?${userQuery}`);
    expect(login.init?.method).toBe("POST");
    const body = JSON.parse(String(login.init?.body));
    expect(body).toEqual({ connectionType: "read", customRedirect: `${REDIRECT}?state=${STATE}`, immediateRedirect: true });
    expect(login.init?.headers?.Signature).toBe(hmac(`{"content":${canonicalJson(body)},"path":"/snapTrade/login","query":"${userQuery}"}`));

    expect(started.url).toBe(fixture<{ redirectURI: string }>("login").redirectURI);
    expect(started.carry).toEqual({ userId: USER_ID, userSecret: USER_SECRET });
    expect(started.url).not.toContain(USER_SECRET);
    expect(body.customRedirect).not.toContain(USER_SECRET);
    for (const { url, init } of sent) {
      expect(url).not.toContain(CONSUMER_KEY);
      expect(JSON.stringify(init)).not.toContain(CONSUMER_KEY);
    }
  });

  test("given the default connector, when authorizing twice, then each sign-in registers its own flexwall- user id", async () => {
    // Given
    const ids: string[] = [];
    const ctx = fakeContext(
      {
        [`${API}/snapTrade/registerUser`]: (init) => {
          ids.push(JSON.parse(String(init?.body)).userId);
          return fixture("register-user");
        },
        [`${API}/snapTrade/login`]: fixture("login"),
      },
      { env: ENV }
    );

    // When
    for (let i = 0; i < 2; i++) await snaptradeConnector.auth!.oauth!.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) expect(id).toMatch(/^flexwall-[0-9a-f-]{36}$/);
  });

  test("given SnapTrade can't verify the server's signature, when authorizing, then the operator gets a sentence without the key", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/snapTrade/registerUser`]: refuse(401, { detail: "Unable to verify signature sent", status_code: 401, code: "1076" }) }, { env: ENV });

    // When
    const error = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("SnapTrade refused this Flexwall server's API key.");
    expect((error as Error).message).not.toContain(CONSUMER_KEY);
  });
});

describe("complete", () => {
  test("given the owner connected a brokerage, when completing, then the user id and secret are sealed and only brokerage names and the account count are public", async () => {
    // Given
    const ctx = fakeContext(
      userRoutes({
        connections: [connection({ name: "Wealthsimple" }), connection({ id: "c2", name: "Fidelity" }), connection({ id: "c3", name: "Fidelity" })],
        accounts: [account({ id: "a1" }), account({ id: "a2", is_paper: true }), account({ id: "a3", account_category: "LOC" })],
      }),
      { env: ENV }
    );

    // When
    const result = await oauth.complete({ fields: {}, query: { state: STATE, status: "SUCCESS", connection_id: "87b24961-b51e-4db8-9226-f198f6518a89" }, redirectUri: REDIRECT, carry: { userId: USER_ID, userSecret: USER_SECRET } }, ctx);

    // Then
    expect(result.secret).toEqual({ userId: USER_ID, userSecret: USER_SECRET });
    expect(result.public).toEqual({ brokerages: "Fidelity, Wealthsimple", accounts: "1" });
    expect(result.label).toBe("Fidelity, Wealthsimple");
    expect(result.accountId).toBe(USER_ID);
    expect(result.expiresAt).toBeUndefined();
    expect(JSON.stringify([result.public, result.label])).not.toContain(USER_SECRET);
    // Both requests are signed and sent in parallel: which leaves first isn't part of the contract.
    expect([...ctx.calls].sort()).toEqual([`${API}/accounts?${userQuery}`, `${API}/authorizations?${userQuery}`]);
  });

  test("given the owner left the portal or it failed, when completing, then the user registered for this sign-in is deleted and they get a sentence", async () => {
    // Given
    const deleted: string[] = [];
    const ctx = fakeContext(
      {
        [`${API}/snapTrade/deleteUser`]: (init, url) => {
          expect(init?.method).toBe("DELETE");
          deleted.push(url);
          return { status: "deleted", detail: "User queued for deletion; please wait for webhook for confirmation.", userId: USER_ID };
        },
      },
      { env: ENV }
    );
    const carry = { userId: USER_ID, userSecret: USER_SECRET };

    // When
    const errors = await Promise.all(
      ([{ status: "ABANDONED" }, { status: "ERROR", status_code: "403", error_code: "1066" }, { status: "ERROR", error_code: "9999" }] as Record<string, string>[]).map((query) =>
        oauth.complete({ fields: {}, query: { state: STATE, ...query }, redirectUri: REDIRECT, carry }, ctx).catch((e: unknown) => e)
      )
    );

    // Then
    expect(errors.map((e) => (e instanceof ConnectorError ? e.message : e))).toEqual([
      "You left SnapTrade before connecting a brokerage, so nothing was connected.",
      "Your brokerage refused those credentials, so nothing was connected. Try again.",
      "SnapTrade couldn't connect your brokerage, so nothing was connected. Try again.",
    ]);
    expect(ctx.calls).toEqual(deleted);
    expect(deleted).toEqual(Array(3).fill(`${API}/snapTrade/deleteUser?clientId=${CLIENT_ID}&timestamp=${TS}&userId=${USER_ID}`));
  });

  test("given the owner cancelled the portal, which sends back only the state, when completing, then no brokerage was connected and the user is deleted", async () => {
    // Given
    const ctx = fakeContext({ ...userRoutes({ connections: [], accounts: [] }), [`${API}/snapTrade/deleteUser`]: { status: "deleted", userId: USER_ID } }, { env: ENV });

    // When
    const error = await oauth.complete({ fields: {}, query: { state: STATE }, redirectUri: REDIRECT, carry: { userId: USER_ID, userSecret: USER_SECRET } }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toStartWith("No brokerage was connected.");
    expect(ctx.calls.filter((u) => u.includes("/snapTrade/deleteUser"))).toEqual([`${API}/snapTrade/deleteUser?clientId=${CLIENT_ID}&timestamp=${TS}&userId=${USER_ID}`]);
  });

  test("given deleting the unfinished sign-in's user fails, when completing, then the owner gets the same sentence and the log holds no secret", async () => {
    // Given
    const logs: string[] = [];
    const failing = [refuse(500, { detail: "Internal error", status_code: 500 }), refuse(401, { detail: "Unable to verify signature sent", status_code: 401, code: "1076" })];
    const contexts = failing.map((answer) => ({ ...fakeContext({ ...userRoutes({ connections: [], accounts: [] }), [`${API}/snapTrade/deleteUser`]: answer }, { env: ENV }), log: (m: string) => logs.push(m) }));
    const carry = { userId: USER_ID, userSecret: USER_SECRET };

    // When
    const errors = [
      await oauth.complete({ fields: {}, query: { state: STATE, status: "ABANDONED" }, redirectUri: REDIRECT, carry }, contexts[0]).catch((e: unknown) => e),
      await oauth.complete({ fields: {}, query: { state: STATE }, redirectUri: REDIRECT, carry }, contexts[1]).catch((e: unknown) => e),
    ];

    // Then
    expect(errors.map((e) => (e instanceof ConnectorError ? e.message : e))).toEqual([
      "You left SnapTrade before connecting a brokerage, so nothing was connected.",
      "No brokerage was connected. Connect again and finish signing in at your brokerage.",
    ]);
    expect(logs).toEqual(["snaptrade user of an unfinished sign-in not deleted: HTTP 500", "snaptrade user of an unfinished sign-in not deleted: ConnectorError"]);
    for (const line of logs) {
      expect(line).not.toContain(USER_SECRET);
      expect(line).not.toContain(USER_ID);
    }
  });

  test("given a new connection whose accounts aren't listed yet, when completing, then it still connects with zero accounts", async () => {
    // Given
    const ctx = fakeContext(userRoutes({ accounts: [] }), { env: ENV });

    // When
    const result = await oauth.complete({ fields: {}, query: { state: STATE, status: "SUCCESS" }, redirectUri: REDIRECT, carry: { userId: USER_ID, userSecret: USER_SECRET } }, ctx);

    // Then
    expect(result.public).toEqual({ brokerages: "Robinhood", accounts: "0" });
    expect(result.label).toBe("Robinhood");
  });

  test("given an expired carry, when completing, then the owner is asked to connect again", async () => {
    // Given
    const ctx = fakeContext({}, { env: ENV });

    // When
    const error = await oauth.complete({ fields: {}, query: { state: STATE, status: "SUCCESS" }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect(ctx.calls).toEqual([]);
  });
});

describe("server configuration", () => {
  test("given no SnapTrade app on the server, when authorizing, completing or fetching, then the owner is told before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: { SNAPTRADE_CLIENT_ID: CLIENT_ID } });

    // When
    const errors = await Promise.all([
      oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e),
      oauth.complete({ fields: {}, query: { state: STATE, status: "SUCCESS" }, redirectUri: REDIRECT, carry: secret }, ctx).catch((e: unknown) => e),
      connector.fetch(request(["portfolio-value"]), ctx).catch((e: unknown) => e),
    ]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("This Flexwall server has no SnapTrade app.");
    }
    expect(ctx.calls).toEqual([]);
  });
});

describe("fetch", () => {
  test("given the documented account, when the portfolio value and account count are fetched, then two signed GETs answer both and no balances are read", async () => {
    // Given
    const signatures: string[] = [];
    const routes = userRoutes();
    const ctx = fakeContext(
      {
        ...routes,
        [`${API}/authorizations?`]: (init) => {
          signatures.push(String(init?.headers?.Signature));
          return fixture("authorizations");
        },
      },
      { env: ENV }
    );

    // When
    const values = await connector.fetch(request(["portfolio-value", "accounts"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(15363.23, "usd"));
    expect(values.accounts).toEqual(number(1, { unit: "count" }));
    // Both requests are signed and sent in parallel: which leaves first isn't part of the contract.
    expect([...ctx.calls].sort()).toEqual([`${API}/accounts?${userQuery}`, `${API}/authorizations?${userQuery}`]);
    expect(signatures).toEqual([hmac(`{"content":null,"path":"/authorizations","query":"${userQuery}"}`)]);
  });

  test("given accounts in several currencies, paper, closed and credit accounts, when the value is fetched, then only real accounts in the largest account's currency are added", async () => {
    // Given
    const logs: string[] = [];
    const accounts = [
      account({ id: "usd-1", amount: 15000, currency: "USD" }),
      account({ id: "cad-1", amount: 40000.1, currency: "CAD" }),
      account({ id: "cad-2", amount: 2500.25, currency: "cad" }),
      account({ id: "cad-cat-null", amount: 100, currency: "CAD", account_category: null }),
      account({ id: "cad-deposit", amount: 50, currency: "CAD", account_category: "DEPOSIT" }),
      account({ id: "paper", amount: 1_000_000, currency: "CAD", is_paper: true }),
      account({ id: "closed", amount: 900_000, currency: "CAD", status: "closed" }),
      account({ id: "archived", amount: 800_000, currency: "CAD", status: "archived" }),
      account({ id: "credit", amount: 700_000, currency: "CAD", account_category: "LOC" }),
      account({ id: "no-total", amount: null }),
    ];
    const ctx = { ...fakeContext(userRoutes({ accounts }), { env: ENV }), log: (m: string) => logs.push(m) };

    // When
    const values = await connector.fetch(request(["portfolio-value", "accounts"]), ctx);

    // Then
    expect(values["portfolio-value"]).toEqual(money(42650.35, "cad"));
    expect(values.accounts).toEqual(number(6, { unit: "count" }));
    expect(logs.some((l) => l.includes("1 snaptrade account(s) in another currency than CAD"))).toBe(true);
  });

  test("given accounts with cash in several currencies, when cash is fetched, then each account's balances are read and cash in the portfolio's currency is added", async () => {
    // Given
    const accounts = [account({ id: "a-usd", amount: 50000, currency: "USD" }), account({ id: "b-cad", amount: 10000, currency: "CAD" }), account({ id: "paper", is_paper: true })];
    const balances = {
      "a-usd": [
        { currency: { code: "USD" }, cash: 1200.5, buying_power: 2400 },
        { currency: { code: "CAD" }, cash: 300, buying_power: 300 },
      ],
      "b-cad": [
        { currency: { code: "USD" }, cash: -200.25, buying_power: 0 },
        { currency: { code: "CAD" }, cash: null, buying_power: null },
      ],
    };
    const ctx = fakeContext(userRoutes({ accounts, balances }), { env: ENV });

    // When
    const values = await connector.fetch(request(["cash"]), ctx);

    // Then
    expect(values.cash).toEqual(money(1000.25, "usd"));
    expect(values["portfolio-value"]).toBeUndefined();
    expect(ctx.calls.filter((u) => u.includes("/balances"))).toEqual([`${API}/accounts/a-usd/balances?${userQuery}`, `${API}/accounts/b-cad/balances?${userQuery}`]);
  });

  test("given more accounts than the cap, when cash is fetched, then only the first accounts' balances are read", async () => {
    // Given
    const accounts = Array.from({ length: MAX_ACCOUNTS + 3 }, (_, i) => account({ id: `acc-${i}` }));
    const ctx = fakeContext(userRoutes({ accounts, balances: {} }), { env: ENV });

    // When
    const values = await connector.fetch(request(["cash"]), ctx);

    // Then
    expect(ctx.calls.filter((u) => u.includes("/balances"))).toHaveLength(MAX_ACCOUNTS);
    expect(values.cash).toBeNull();
  });

  test("given no account yet, when every metric is fetched, then money metrics are empty and the count is zero", async () => {
    // Given
    const ctx = fakeContext(userRoutes({ accounts: [] }), { env: ENV });

    // When
    const values = await connector.fetch(request(["portfolio-value", "cash", "accounts"]), ctx);

    // Then
    expect(values).toEqual({ "portfolio-value": null, cash: null, accounts: number(0, { unit: "count" }) });
  });

  test("given a disabled connection, when fetched, then the owner is asked to reconnect that brokerage and no stale cached value is returned", async () => {
    // Given
    const ctx = fakeContext(userRoutes({ connections: [connection({ name: "Fidelity" }), connection({ id: "c2", name: "Robinhood", disabled: true })] }), { env: ENV });

    // When
    const error = await connector.fetch(request(["portfolio-value", "cash"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toStartWith("Reconnect Robinhood in SnapTrade: ");
    expect(ctx.calls.some((u) => u.includes("/balances"))).toBe(false);
  });

  test("given SnapTrade no longer knows the user, when fetched, then the owner gets a sentence that holds neither the secret nor the URL", async () => {
    // Given
    const ctx = fakeContext(
      { ...userRoutes(), [`${API}/authorizations?`]: refuse(401, { detail: "Invalid userID or userSecret provided", status_code: 401, code: "1083" }) },
      { env: ENV }
    );

    // When
    const error = await connector.fetch(request(["portfolio-value"]), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("SnapTrade no longer knows this connection. Remove it and connect your brokerage again.");
    expect((error as Error).message).not.toContain(USER_SECRET);
    expect((error as Error).message).not.toContain(API);
  });

  test("given 401 and 403 answers without a mapped code, when fetching or authorizing, then the owner or operator gets a sentence, and a 400 with 1076 isn't blamed on the key", async () => {
    // Given
    const userUnknown = fakeContext({ ...userRoutes(), [`${API}/accounts?`]: refuse(401, { detail: "User not found", status_code: 401, code: "0000" }) }, { env: ENV });
    const forbidden = fakeContext({ ...userRoutes(), [`${API}/authorizations?`]: refuse(403, { default_detail: "User does not have permission to access this resource", default_code: 1066 }) }, { env: ENV });
    const keyUnknown = fakeContext({ [`${API}/snapTrade/registerUser`]: refuse(401, { detail: "Invalid client", status_code: 401, code: "9999" }) }, { env: ENV });
    const badData = fakeContext({ [`${API}/snapTrade/registerUser`]: fixture("register-user"), [`${API}/snapTrade/login`]: refuse(400, { default_detail: "Unable to verify data sent", default_code: 1076 }) }, { env: ENV });

    // When
    const errors = await Promise.all([
      connector.fetch(request(["portfolio-value"]), userUnknown).catch((e: unknown) => e),
      connector.fetch(request(["portfolio-value"]), forbidden).catch((e: unknown) => e),
      oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, keyUnknown).catch((e: unknown) => e),
      oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, badData).catch((e: unknown) => e),
    ]);

    // Then
    expect(errors.slice(0, 3).map((e) => (e instanceof ConnectorError ? e.message : e))).toEqual([
      "SnapTrade no longer knows this connection. Remove it and connect your brokerage again.",
      "SnapTrade refused this Flexwall server's API key.",
      "SnapTrade refused this Flexwall server's API key.",
    ]);
    expect(errors[3]).toBeInstanceOf(HttpError);
    expect(errors[3]).not.toBeInstanceOf(ConnectorError);
  });

  test("given an outage or a rate limit, when fetched, then the error passes through for the host to retry", async () => {
    // Given
    const outage = fakeContext({ ...userRoutes(), [`${API}/accounts?`]: refuse(503, { detail: "Unable to sync with brokerage account.", status_code: 503, code: 3002 }) }, { env: ENV });
    const limited = fakeContext({ ...userRoutes(), [`${API}/accounts?`]: refuse(429, { detail: "Request was throttled. Expected available in 7 seconds.", status_code: 429, code: "0000" }) }, { env: ENV });

    // When
    const errors = await Promise.all([connector.fetch(request(["portfolio-value"]), outage).catch((e: unknown) => e), connector.fetch(request(["portfolio-value"]), limited).catch((e: unknown) => e)]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).not.toBeInstanceOf(ConnectorError);
    }
  });
});

describe("disconnect", () => {
  const disconnect = connector.auth!.disconnect!;
  const connectionPublic = { brokerages: "Robinhood", accounts: "1" };

  test("given a connection, when it is removed, then its SnapTrade user is deleted with a signed DELETE that carries the user id but not its secret", async () => {
    // Given
    const sent: { url: string; init: GuardedFetchInit | undefined }[] = [];
    const ctx = fakeContext(
      {
        [`${API}/snapTrade/deleteUser`]: (init, url) => {
          sent.push({ url, init });
          return { status: "deleted", detail: "User queued for deletion; please wait for webhook for confirmation.", userId: USER_ID };
        },
      },
      { env: ENV }
    );

    // When
    await disconnect({ secret, public: connectionPublic }, ctx);

    // Then
    const query = `clientId=${CLIENT_ID}&timestamp=${TS}&userId=${USER_ID}`;
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${API}/snapTrade/deleteUser?${query}`);
    expect(sent[0].init?.method).toBe("DELETE");
    expect(sent[0].init?.body).toBeUndefined();
    expect(sent[0].init?.headers?.Signature).toBe(hmac(`{"content":null,"path":"/snapTrade/deleteUser","query":"${query}"}`));
    expect(JSON.stringify(sent)).not.toContain(USER_SECRET);
    expect(JSON.stringify(sent)).not.toContain(CONSUMER_KEY);
  });

  test("given SnapTrade no longer knows the user, when the connection is removed, then it resolves", async () => {
    // Given
    const answers = [refuse(404, { detail: "User not found", status_code: 404 }), refuse(401, { detail: "Invalid userID or userSecret provided", status_code: 401, code: "1083" })];

    // When
    const results = await Promise.all(answers.map((answer) => disconnect({ secret, public: connectionPublic }, fakeContext({ [`${API}/snapTrade/deleteUser`]: answer }, { env: ENV }))));

    // Then
    expect(results).toEqual([undefined, undefined]);
  });

  test("given no SnapTrade app on the server or no stored user, when the connection is removed, then it resolves without a request", async () => {
    // Given
    const noApp = fakeContext({}, { env: { SNAPTRADE_CLIENT_ID: CLIENT_ID } });
    const noUser = fakeContext({}, { env: ENV });

    // When
    await disconnect({ secret, public: connectionPublic }, noApp);
    await disconnect({ secret: {}, public: connectionPublic }, noUser);

    // Then
    expect([...noApp.calls, ...noUser.calls]).toEqual([]);
  });

  test("given SnapTrade refuses or fails, when the connection is removed, then it throws without the user secret, the consumer key or the URL", async () => {
    // Given
    const refused = fakeContext({ [`${API}/snapTrade/deleteUser`]: refuse(401, { detail: "Unable to verify signature sent", status_code: 401, code: "1076" }) }, { env: ENV });
    const outage = fakeContext({ [`${API}/snapTrade/deleteUser`]: refuse(500, { detail: "Internal error", status_code: 500 }) }, { env: ENV });

    // When
    const errors = await Promise.all([refused, outage].map((ctx) => disconnect({ secret, public: connectionPublic }, ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect(errors[1]).toBeInstanceOf(HttpError);
    for (const error of errors) {
      const message = (error as Error).message;
      expect(message).not.toContain(USER_SECRET);
      expect(message).not.toContain(CONSUMER_KEY);
      expect(message).not.toContain(USER_ID);
    }
  });
});

describe("currency rule", () => {
  test("given amounts in two currencies and a preferred one absent from them, when summed, then the largest amount's currency wins", () => {
    // Given
    const amounts = [
      { amount: 10, currency: "EUR" },
      { amount: 30, currency: "GBP" },
      { amount: 5, currency: "gbp" },
    ];

    // When
    const sum = sumInLargestCurrency(amounts, "JPY");

    // Then
    expect(sum).toEqual({ total: 35, currency: "GBP", skipped: 1 });
    expect(sumInLargestCurrency([])).toBeNull();
  });
});
