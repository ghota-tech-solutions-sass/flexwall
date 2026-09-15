import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { CONNECTOR_CAPABILITIES, powensConnector, powensHost, totals, type PowensAccount } from "../src/index";

/**
 * Fixtures follow the examples of Powens' documentation (the accounts example
 * of the Transactions guide, the connection expand example of API design),
 * given more accounts where a test needs them. `type` and `currency` appear
 * both as bare strings and as objects, as the docs show both.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://flexwall-sandbox.biapi.pro/2.0";
const ENV = { POWENS_DOMAIN: "flexwall-sandbox", POWENS_CLIENT_ID: "81234567", POWENS_CLIENT_SECRET: "s3cr3t-client-XYZ" };
const TOKEN = "permanent-user-token-ABC123";
const CODE = "nc0EdV2MiVmSig1";
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const STATE = "3a57e2d3-2e0c-4336-af9b-7fa94f0606a3";
const oauth = powensConnector.auth!.oauth!;

const bearer = (init: GuardedFetchInit | undefined) => init?.headers?.Authorization;
const userRoutes = (connections: unknown = fixture("connections"), accounts: unknown = fixture("accounts")) => ({
  [`${API}/users/me/connections`]: (init: GuardedFetchInit | undefined) => {
    expect(bearer(init)).toBe(`Bearer ${TOKEN}`);
    return connections;
  },
  [`${API}/users/me/accounts`]: (init: GuardedFetchInit | undefined) => {
    expect(bearer(init)).toBe(`Bearer ${TOKEN}`);
    return accounts;
  },
});
const request = () => ({ metrics: ["net-worth", "cash", "investments", "accounts"], params: {}, secret: { token: TOKEN }, public: { banks: "Connecteur de test", accounts: "7" } });
const leaks = (text: string) => [TOKEN, ENV.POWENS_CLIENT_SECRET].some((s) => text.includes(s));

describe("powens connector", () => {
  test("given the plugin, when checked, then it has no problems, signs in without connect or refresh, and only balances are sensitive", () => {
    // Given
    const def = plugin.connectors![0];

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
    expect(def.connect).toBeUndefined();
    expect(def.auth?.oauth?.refresh).toBeUndefined();
    expect(def.auth?.fields).toEqual([]);
    expect(def.tier).toBe("pro");
    expect(def.verified).toBe(true);
    expect(def.ttl).toBeGreaterThanOrEqual(6 * 3600);
    expect(def.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["net-worth", true, "wealth"],
      ["cash", true, null],
      ["investments", true, null],
      ["accounts", false, null],
    ]);
    expect(new Set(def.metrics.map((m) => def.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
  });

  test("given POWENS_DOMAIN as a name, a host or a URL, when read, then each gives the same host, and nonsense is refused", () => {
    // Given
    const spellings = ["flexwall-sandbox", "flexwall-sandbox.biapi.pro", "https://flexwall-sandbox.biapi.pro/2.0", " Flexwall-Sandbox "];

    // When
    const hosts = spellings.map(powensHost);

    // Then
    for (const host of hosts) expect(host).toBe("flexwall-sandbox.biapi.pro");
    expect(powensHost("evil.com/x?y")).toBeNull();
    expect(powensHost("")).toBeNull();
  });

  test("given no Powens app on the server, when authorizing, completing or fetching, then the owner is told before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: { POWENS_DOMAIN: "flexwall-sandbox", POWENS_CLIENT_ID: "81234567" } });

    // When
    const errors = await Promise.all([
      oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e),
      oauth.complete({ fields: {}, query: { connection_id: "42", state: STATE }, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx).catch((e: unknown) => e),
      powensConnector.fetch(request(), ctx).catch((e: unknown) => e),
    ]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("This Flexwall server has no Powens app.");
    }
    expect(ctx.calls).toEqual([]);
  });

  test("given the server's app, when authorizing, then a user is created, a single-use code is made and the webview URL carries state, redirect and code while the token stays in carry", async () => {
    // Given
    let initBody: unknown = null;
    const ctx = fakeContext(
      {
        [`${API}/auth/init`]: (init) => {
          expect(init?.method).toBe("POST");
          initBody = JSON.parse(String(init?.body));
          return { auth_token: TOKEN, type: "permanent", id_user: 7, expires_in: null };
        },
        [`${API}/auth/token/code`]: (init) => {
          expect(bearer(init)).toBe(`Bearer ${TOKEN}`);
          return { code: CODE, type: "temporary", access: "single", expires_in: 1800 };
        },
      },
      { env: { ...ENV, POWENS_DOMAIN: "flexwall-sandbox.biapi.pro" } }
    );

    // When
    const started = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(initBody).toEqual({ client_id: ENV.POWENS_CLIENT_ID, client_secret: ENV.POWENS_CLIENT_SECRET });
    expect(ctx.calls).toEqual([`${API}/auth/init`, `${API}/auth/token/code?type=singleAccess`]);
    const url = new URL(started.url);
    expect(`${url.origin}${url.pathname}`).toBe("https://webview.powens.com/fr/connect");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      domain: "flexwall-sandbox.biapi.pro",
      client_id: ENV.POWENS_CLIENT_ID,
      redirect_uri: REDIRECT,
      code: CODE,
      state: STATE,
      connector_capabilities: CONNECTOR_CAPABILITIES,
    });
    expect(leaks(started.url)).toBe(false);
    expect(ctx.calls.some(leaks)).toBe(false);
    expect(started.carry).toEqual({ token: TOKEN, user: "7" });
  });

  test("given Powens refuses the client credentials, when authorizing, then the operator gets a sentence without the secret", async () => {
    // Given
    const ctx = fakeContext(
      {
        [`${API}/auth/init`]: (_init, url) => {
          throw new HttpError(401, url, JSON.stringify({ code: "invalidValue", description: "bad client" }));
        },
      },
      { env: ENV }
    );

    // When
    const error = await oauth.authorize({ fields: {}, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Powens refused this Flexwall server's client application.");
    expect(leaks((error as Error).message)).toBe(false);
  });

  test("given the owner comes back with a connection, when completing, then the token is the secret, the bank names the label and the Powens user is the account", async () => {
    // Given
    const ctx = fakeContext(userRoutes(), { env: ENV });

    // When
    const result = await oauth.complete({ fields: {}, query: { connection_id: "42", state: STATE }, redirectUri: REDIRECT, carry: { token: TOKEN, user: "7" } }, ctx);

    // Then
    expect(result.secret).toEqual({ token: TOKEN });
    expect(result.public).toEqual({ banks: "Connecteur de test", accounts: "7" });
    expect(result.label).toBe("Connecteur de test (7 accounts)");
    expect(result.accountId).toBe("7");
    expect(result.expiresAt).toBeUndefined();
    expect(leaks(JSON.stringify(result.public) + result.label)).toBe(false);
    expect(ctx.calls).toEqual([`${API}/users/me/connections?expand=connector`, `${API}/users/me/accounts`]);
  });

  test("given a connection id this user doesn't have, when completing, then the owner is asked to try again", async () => {
    // Given
    const ctx = fakeContext(userRoutes(), { env: ENV });

    // When
    const error = await oauth.complete({ fields: {}, query: { connection_id: "999", state: STATE }, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Powens didn't finish connecting your bank. Try again.");
  });

  test("given Powens refuses the token it just issued, when completing, then the owner isn't sent into a reconnect loop", async () => {
    // Given
    const refuse = (_init: GuardedFetchInit | undefined, url: string) => {
      throw new HttpError(401, url, "");
    };
    const ctx = fakeContext({ [`${API}/users/me/connections`]: refuse, [`${API}/users/me/accounts`]: refuse }, { env: ENV });

    // When
    const error = await oauth.complete({ fields: {}, query: { connection_id: "42" }, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Powens refused the connection it just made. Try again later.");
  });

  test("given no user id in carry, when completing, then the connection's user id is the account", async () => {
    // Given
    const ctx = fakeContext(userRoutes(), { env: ENV });

    // When
    const result = await oauth.complete({ fields: {}, query: { connection_id: "42" }, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx);

    // Then
    expect(result.accountId).toBe("7");
  });

  test("given the owner cancelled, declined the terms or Powens failed, when completing, then each ends with a sentence and no request", async () => {
    // Given
    const ctx = fakeContext({}, { env: ENV });
    const complete = (query: Record<string, string>) => oauth.complete({ fields: {}, query, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx).then(() => new Error("connected"), (e: Error) => e);

    // When
    const denied = await complete({ error: "access_denied", error_description: "User cancelled", state: STATE });
    const tos = await complete({ error: "tos_declined", state: STATE });
    const failed = await complete({ error: "server_error", error_description: "Connector unavailable", state: STATE });

    // Then
    expect(denied).toBeInstanceOf(ConnectorError);
    expect(denied.message).toBe("You cancelled in Powens, so nothing was connected.");
    expect(tos.message).toBe("You declined Powens' terms, so nothing was connected.");
    expect(failed).toBeInstanceOf(ConnectorError);
    expect(failed.message).toBe("Powens didn't connect your bank: Connector unavailable");
    expect(ctx.calls).toEqual([]);
  });

  test("given a callback without connection_id, when completing, then the owner is asked to try again before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: ENV });

    // When
    const error = await oauth.complete({ fields: {}, query: { state: STATE }, redirectUri: REDIRECT, carry: { token: TOKEN } }, ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Powens didn't finish connecting your bank. Try again.");
    expect(ctx.calls).toEqual([]);
  });

  test("given the documented accounts, when fetched, then cash, investments and net worth are summed in euros, loans and cards subtracted, and the dollar account left out", async () => {
    // Given
    const logs: string[] = [];
    const ctx = { ...fakeContext(userRoutes(), { env: ENV }), log: (m: string) => logs.push(m) };

    // When
    const values = await powensConnector.fetch(request(), ctx);

    // Then
    // Cash: checking 1,452.56 + Livret A 22,950. Investments: PEA 48,210.40 + life insurance 1,055,575.41.
    // Debt: loan |-150,000| + card |-320.50|. The USD brokerage account is left out.
    expect(values.cash).toEqual(money(24_402.56, "eur"));
    expect(values.investments).toEqual(money(1_103_785.81, "eur"));
    expect(values["net-worth"]).toEqual(money(977_867.87, "eur"));
    expect(values.accounts).toEqual(number(7, { unit: "count" }));
    expect(logs).toEqual(["1 powens account(s) not in EUR: left out"]);
    expect(leaks(JSON.stringify(values) + logs.join())).toBe(false);
  });

  test("given disabled, deleted and hidden accounts, when totalled, then only active accounts count", () => {
    // Given
    const eur = { id: "EUR" };
    const accounts: PowensAccount[] = [
      { id: 1, type: "checking", balance: 1000, currency: eur, disabled: null, deleted: null },
      { id: 2, type: "savings", balance: 5000, currency: eur, disabled: "2026-06-01 12:34:56", deleted: null },
      { id: 3, type: "market", balance: 7000, currency: eur, disabled: null, deleted: "2026-07-01 00:00:00" },
      { id: 4, type: "pea", balance: 9000, currency: eur, disabled: null, deleted: null, display: false },
      { id: 5, type: { name: "per" }, balance: 2000, currency: "EUR", disabled: null, deleted: null },
    ];

    // When
    const t = totals(accounts);

    // Then
    expect(t).toEqual({ cash: 1000, investments: 2000, debt: 0, netWorth: 3000, accounts: 2, otherCurrency: 0, unknownType: 0 });
  });

  test("given a loan reported as a positive balance, when totalled, then the amount owed is still subtracted", () => {
    // Given
    const accounts: PowensAccount[] = [
      { id: 1, type: "checking", balance: 3000, currency: { id: "EUR" } },
      { id: 2, type: "consumercredit", balance: 1200, currency: { id: "EUR" } },
      { id: 3, type: "unknown", balance: 50, currency: { id: "EUR" } },
    ];

    // When
    const t = totals(accounts);

    // Then
    expect(t.netWorth).toBe(1800);
    expect(t.debt).toBe(1200);
    expect(t.unknownType).toBe(1);
  });

  test("given a connection waiting for SCA, when fetched, then the owner is asked to reconnect that bank in Powens", async () => {
    // Given
    const connections = { connections: [{ ...fixture("connections").connections[0], state: "SCARequired" }] };
    const ctx = fakeContext(userRoutes(connections), { env: ENV });

    // When
    const error = await powensConnector.fetch(request(), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Reconnect Connecteur de test in Powens: your bank wants you to confirm your identity again.");
  });

  test("given a wrong password or an action needed at the bank, when fetched, then each asks for a reconnect", async () => {
    // Given
    const errors: string[] = [];
    for (const state of ["wrongpass", "actionNeeded"]) {
      const connections = { connections: [{ ...fixture("connections").connections[0], state }] };
      const ctx = fakeContext(userRoutes(connections), { env: ENV });

      // When
      errors.push(await powensConnector.fetch(request(), ctx).then(() => "", (e: Error) => e.message));
    }

    // Then
    expect(errors).toEqual([
      "Reconnect Connecteur de test in Powens: your bank refused the saved password.",
      "Reconnect Connecteur de test in Powens: your bank wants you to do something on its website or app.",
    ]);
  });

  test("given a bank that is temporarily unavailable, when fetched, then the last synced balances still come back", async () => {
    // Given
    const connections = { connections: [{ ...fixture("connections").connections[0], state: "websiteUnavailable" }] };
    const ctx = fakeContext(userRoutes(connections), { env: ENV });

    // When
    const values = await powensConnector.fetch(request(), ctx);

    // Then
    expect(values.cash).toEqual(money(24_402.56, "eur"));
  });

  test("given a revoked token, when fetched, then the owner is asked to reconnect Powens without the token in the message", async () => {
    // Given
    const refuse = (_init: GuardedFetchInit | undefined, url: string) => {
      throw new HttpError(401, url, JSON.stringify({ code: "invalidValue", description: "Invalid token" }));
    };
    const ctx = fakeContext({ [`${API}/users/me/connections`]: refuse, [`${API}/users/me/accounts`]: refuse }, { env: ENV });

    // When
    const error = await powensConnector.fetch(request(), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toBe("Reconnect Powens: it no longer accepts this connection.");
    expect(leaks((error as Error).message)).toBe(false);
  });

  test("given a rate limit or an outage, when fetched, then the error passes through", async () => {
    // Given
    const statuses = [429, 503];
    const results: unknown[] = [];
    for (const status of statuses) {
      const fail = (_init: GuardedFetchInit | undefined, url: string) => {
        throw new HttpError(status, url, "");
      };
      const ctx = fakeContext({ [`${API}/users/me/connections`]: fail, [`${API}/users/me/accounts`]: fail }, { env: ENV });

      // When
      results.push(await powensConnector.fetch(request(), ctx).catch((e: unknown) => e));
    }

    // Then
    for (const [i, error] of results.entries()) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).not.toBeInstanceOf(ConnectorError);
      expect((error as HttpError).status).toBe(statuses[i]);
    }
  });
});
