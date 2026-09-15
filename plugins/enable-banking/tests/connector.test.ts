import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BlockedRequestError, checkPlugins, ConnectorError, HttpError, money, number, validateFields, type ConnectorDef, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { API, enableBankingConnector, enableBankingJwt, importPrivateKey, JWT_SECONDS, makeEnableBankingConnector, MAX_ACCOUNTS, pickBalance, privateKeyDer, sumBalances, type Balance } from "../src/index";

/**
 * Fixtures follow the examples of Enable Banking's API reference, trimmed and
 * given a second account where a test needs one. The RSA key pair is
 * generated when the tests start, so the repository holds no private key.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const NOW = Date.parse("2026-09-15T08:00:00Z");
const APP_ID = "cf589be3-3755-465b-a8df-a90a16a31403";
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const STATE = "3a57e2d3-2e0c-4336-af9b-7fa94f0606a3";
const CURRENT = "07cc67f4-45d6-494b-adac-09b5cbc7e2b5";
const SAVINGS = "497f6eca-6276-4993-bfeb-53cbbbba6f08";
const SESSION = "4e0f1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b";

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const pem = (label: string, bytes: Uint8Array) => `-----BEGIN ${label}-----\n${toBase64(bytes).match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64(part)));

const rsaPair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
const PEM = pem("PRIVATE KEY", new Uint8Array(await crypto.subtle.exportKey("pkcs8", rsaPair.privateKey)));
const ENV = { ENABLE_BANKING_APP_ID: APP_ID, ENABLE_BANKING_PRIVATE_KEY: PEM };
const PEM_BODY = PEM.split("\n")[1];

async function verifies(jwt: string): Promise<boolean> {
  const [header, payload, signature] = jwt.split(".");
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, rsaPair.publicKey, fromBase64(signature), new TextEncoder().encode(`${header}.${payload}`));
}

const connector: ConnectorDef = makeEnableBankingConnector({ now: () => NOW });
const oauth = connector.auth!.oauth!;

const refuse = (status: number, error: string) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify({ message: error, code: status, error, detail: null }));
};
const balances = (...list: [type: string, amount: string, currency?: string][]) => ({
  balances: list.map(([balance_type, amount, currency = "EUR"]) => ({ name: balance_type, balance_amount: { currency, amount }, balance_type })),
});
const request = (metrics: string[], accounts = `${CURRENT},${SAVINGS}`) => ({ metrics, params: {}, secret: { session: SESSION, accounts }, public: { bank: "Nordea", country: "FI", accounts: "2" } });

describe("enable-banking plugin", () => {
  test("given the plugin, when checked, then it has no problems, uses oauth without connect and only the balance is sensitive", () => {
    // Given
    const def = plugin.connectors![0];

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
    expect(def.connect).toBeUndefined();
    expect(def.auth?.oauth?.refresh).toBeUndefined();
    expect(def.ttl).toBeGreaterThanOrEqual(6 * 3600);
    expect(def.metrics.map((m) => [m.id, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["balance", true, "wealth"],
      ["accounts", false, null],
    ]);
    expect(validateFields(def.auth!.fields, { country: "FR", bank: "Crédit Agricole" }).error).toBeNull();
  });

  test("given a PKCS#8 key with newlines, \\n escapes or none, when read, then each gives the same key, and PKCS#1 is refused with the fix", () => {
    // Given
    const escaped = PEM.trim().replace(/\n/g, "\\n");
    const flat = PEM.replace(/\n/g, "");
    const pkcs1 = "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----";

    // When
    const ders = [PEM, escaped, flat].map((k) => [...privateKeyDer(k)]);

    // Then
    for (const der of ders) expect(der).toEqual(ders[0]);
    expect(() => privateKeyDer(pkcs1)).toThrow("openssl pkcs8 -topk8");
  });

  test("given the server key, when a JWT is signed, then it verifies with the public key and carries Enable Banking's header and claims", async () => {
    // Given
    const key = await importPrivateKey(PEM);

    // When
    const jwt = await enableBankingJwt({ appId: APP_ID, key, nowSeconds: NOW / 1000 });

    // Then
    const [header, payload] = jwt.split(".");
    expect(decode(header)).toEqual({ typ: "JWT", alg: "RS256", kid: APP_ID });
    const claims = decode(payload);
    expect(claims).toEqual({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: NOW / 1000, exp: NOW / 1000 + JWT_SECONDS });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(86400);
    expect(jwt).not.toContain("=");
    expect(await verifies(jwt)).toBe(true);
  });

  test("given no application on the server, when authorizing, completing or reading balances, then the owner is told before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: { ENABLE_BANKING_APP_ID: APP_ID } });

    // When
    const errors = await Promise.all([
      oauth.authorize({ fields: { country: "FI", bank: "Nordea" }, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e),
      oauth.complete({ fields: {}, query: { code: "abc" }, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e),
      connector.fetch(request(["balance"]), ctx).catch((e: unknown) => e),
    ]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("This Flexwall server has no Enable Banking application.");
    }
    expect(ctx.calls).toEqual([]);
  });

  test("given a bank typed in another case, when authorizing, then its listed name and longest consent go to POST /auth with a signed JWT", async () => {
    // Given
    let sent: { body: Record<string, unknown>; authorization: string } | null = null;
    const listed: string[] = [];
    const ctx = fakeContext(
      {
        [`${API}/aspsps`]: (init) => {
          listed.push(String(init?.headers?.Authorization));
          return fixture("aspsps");
        },
        [`${API}/auth`]: (init) => {
          sent = { body: JSON.parse(String(init?.body)), authorization: String(init?.headers?.Authorization) };
          expect(init?.method).toBe("POST");
          return fixture("auth");
        },
      },
      { env: ENV }
    );

    // When
    const result = await oauth.authorize({ fields: { country: "FI", bank: "  nordea " }, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(result).toEqual({ url: "https://auth.enablebanking.com/ais/start?sessionid=73100c65-c54d-46a1-87d1-aa3effde435a" });
    expect(ctx.calls[0]).toBe(`${API}/aspsps?country=FI&psu_type=personal&service=AIS`);
    expect(sent!.body).toEqual({
      // 15,552,000 s (180 days) less a 10-minute margin.
      access: { valid_until: new Date(NOW + (15_552_000 - 600) * 1000).toISOString() },
      aspsp: { name: "Nordea", country: "FI" },
      state: STATE,
      redirect_url: REDIRECT,
      psu_type: "personal",
    });
    expect(await verifies(sent!.authorization.replace("Bearer ", ""))).toBe(true);
    expect(await verifies(listed[0].replace("Bearer ", ""))).toBe(true);
  });

  test("given a bank Enable Banking doesn't list, or one renamed before POST /auth, when authorizing, then the owner is told its name", async () => {
    // Given
    const unlisted = fakeContext({ [`${API}/aspsps`]: fixture("aspsps") }, { env: ENV });
    const renamed = fakeContext({ [`${API}/aspsps`]: fixture("aspsps"), [`${API}/auth`]: refuse(400, "WRONG_ASPSP_PROVIDED") }, { env: ENV });

    // When
    const errors = await Promise.all([
      oauth.authorize({ fields: { country: "FI", bank: "Banque Imaginaire" }, redirectUri: REDIRECT, state: STATE }, unlisted).catch((e: unknown) => e),
      oauth.authorize({ fields: { country: "FI", bank: "OP" }, redirectUri: REDIRECT, state: STATE }, renamed).catch((e: unknown) => e),
    ]);

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toBe("Enable Banking lists no bank called Banque Imaginaire in Finland for personal accounts. Copy the name from Enable Banking's bank list.");
    expect(unlisted.calls).toHaveLength(1);
    expect(errors[1]).toBeInstanceOf(ConnectorError);
    expect((errors[1] as Error).message).toContain("no bank called OP in Finland");
  });

  test("given a bank list too large to read, when authorizing, then the typed name is tried with a 180-day consent", async () => {
    // Given
    let body: { access: { valid_until: string }; aspsp: unknown } | null = null;
    const ctx = fakeContext(
      {
        [`${API}/aspsps`]: () => {
          throw new BlockedRequestError("answered more than 4000 KB", "too-large");
        },
        [`${API}/auth`]: (init) => {
          body = JSON.parse(String(init?.body));
          return fixture("auth");
        },
      },
      { env: ENV }
    );

    // When
    await oauth.authorize({ fields: { country: "DE", bank: "Deutsche Bank" }, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(body!.aspsp).toEqual({ name: "Deutsche Bank", country: "DE" });
    expect(body!.access.valid_until).toBe(new Date(NOW + (180 * 86400 - 600) * 1000).toISOString());
  });

  test("given the owner comes back with a code, when completing, then the session's current and savings accounts are stored secretly and the consent end is expiresAt", async () => {
    // Given
    let code: unknown = null;
    const ctx = fakeContext(
      {
        [`${API}/sessions`]: (init) => {
          code = JSON.parse(String(init?.body)).code;
          return fixture("session");
        },
      },
      { env: ENV }
    );

    // When
    const result = await oauth.complete({ fields: { country: "FI", bank: "Nordea" }, query: { code: "auth-code-1", state: STATE }, redirectUri: REDIRECT, carry: {} }, ctx);

    // Then
    expect(code).toBe("auth-code-1");
    expect(result.secret).toEqual({ session: SESSION, accounts: `${CURRENT},${SAVINGS}` });
    expect(result.public).toEqual({ bank: "Nordea", country: "FI", accounts: "2", consentUntil: "2027-03-14" });
    expect(result.label).toBe("Nordea (2 accounts)");
    expect(result.expiresAt).toBe(Date.parse("2027-03-14T12:00:00Z"));
    expect(result.accountId).toMatch(/^[0-9a-f]{64}$/);
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    for (const hidden of [SESSION, CURRENT, SAVINGS, "FI0455231152453547", "E8GzhnnsFC7K"]) expect(shown).not.toContain(hidden);
  });

  test("given the same accounts in another order in a new session, when completing, then the account id doesn't change", async () => {
    // Given
    const first = fixture("session");
    const second = { ...fixture("session"), session_id: "11111111-2222-4333-8444-555555555555", accounts: [...fixture("session").accounts].reverse() };
    const ctxFor = (body: unknown) => fakeContext({ [`${API}/sessions`]: body as Record<string, unknown> }, { env: ENV });
    const input = { fields: {}, query: { code: "c" }, redirectUri: REDIRECT, carry: {} };

    // When
    const [a, b] = await Promise.all([oauth.complete(input, ctxFor(first)), oauth.complete(input, ctxFor(second))]);

    // Then
    expect(a.accountId).toBe(b.accountId!);
  });

  test("given the owner declined, the bank failed, or the code is wrong or used, when completing, then each is a sentence and declines make no request", async () => {
    // Given
    const quiet = fakeContext({}, { env: ENV });
    const wrong = fakeContext({ [`${API}/sessions`]: refuse(400, "WRONG_AUTHORIZATION_CODE") }, { env: ENV });
    const used = fakeContext({ [`${API}/sessions`]: refuse(400, "ALREADY_AUTHORIZED") }, { env: ENV });
    const complete = (query: Record<string, string>, ctx: typeof quiet) => oauth.complete({ fields: {}, query, redirectUri: REDIRECT, carry: {} }, ctx).catch((e: unknown) => e);

    // When
    const errors = await Promise.all([
      complete({ error: "access_denied", error_description: "Cancelled by user", state: STATE }, quiet),
      complete({ error: "server_error", error_description: "<script>", state: STATE }, quiet),
      complete({ state: STATE }, quiet),
      complete({ code: "nope" }, wrong),
      complete({ code: "again" }, used),
    ]);

    // Then
    expect(errors.map((e) => (e as Error).message)).toEqual([
      "You didn't let Flexwall see your accounts, so nothing was connected.",
      "Your bank didn't finish the sign-in, so nothing was connected. Try again.",
      "Your bank didn't finish the sign-in, so nothing was connected. Try again.",
      "That bank sign-in expired or was already used. Connect again.",
      "That bank sign-in expired or was already used. Connect again.",
    ]);
    for (const error of errors) expect(error).toBeInstanceOf(ConnectorError);
    expect(quiet.calls).toEqual([]);
  });

  test("given a session sharing no account, or only a card, when completing, then the owner is told what to pick", async () => {
    // Given
    const session = fixture("session");
    const none = fakeContext({ [`${API}/sessions`]: { ...session, accounts: [] } }, { env: ENV });
    const cardOnly = fakeContext({ [`${API}/sessions`]: { ...session, accounts: [session.accounts[2]] } }, { env: ENV });
    const input = { fields: {}, query: { code: "c" }, redirectUri: REDIRECT, carry: {} };

    // When
    const errors = await Promise.all([oauth.complete(input, none).catch((e: unknown) => e), oauth.complete(input, cardOnly).catch((e: unknown) => e)]);

    // Then
    expect((errors[0] as Error).message).toContain("shared no account");
    expect((errors[1] as Error).message).toContain("only shared card or loan accounts");
  });

  test("given balances of several types, when one is picked, then booked beats expected and available, and the latest of a type wins", () => {
    // Given
    const list: Balance[] = [
      { name: "a", balance_type: "ITAV", balance_amount: { currency: "EUR", amount: "900.00" } },
      { name: "b", balance_type: "XPCD", balance_amount: { currency: "EUR", amount: "480.00" } },
      { name: "c", balance_type: "CLBD", balance_amount: { currency: "EUR", amount: "500.00" }, reference_date: "2026-09-13" },
      { name: "d", balance_type: "CLBD", balance_amount: { currency: "EUR", amount: "510.00" }, reference_date: "2026-09-14" },
    ];

    // When
    const picks = [pickBalance(list), pickBalance(list.slice(0, 2)), pickBalance(list.slice(0, 1)), pickBalance([{ name: "x", balance_type: "OTHR", balance_amount: { currency: "EUR", amount: "n/a" } }])];

    // Then
    expect(picks.map((p) => p?.balance_amount.amount ?? null)).toEqual(["510.00", "480.00", "900.00", null]);
    expect(pickBalance(fixture("balances").balances)?.balance_amount).toEqual({ currency: "EUR", amount: "1.23" });
  });

  test("given balances in two currencies, when summed, then the first account's currency is kept, cents stay exact and the rest is counted", () => {
    // Given
    const amounts = [
      { currency: "EUR", amount: "0.10" },
      { currency: "SEK", amount: "1000.00" },
      { currency: "eur", amount: "0.20" },
    ];

    // When
    const sum = sumBalances(amounts);

    // Then
    expect(sum).toEqual({ total: 0.3, currency: "EUR", skipped: 1 });
    expect(sumBalances([])).toBeNull();
  });

  test("given two accounts and one in another currency, when every metric is fetched, then balances are summed in the first currency with no PSU headers", async () => {
    // Given
    const other = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
    const logs: string[] = [];
    const headers: Record<string, string>[] = [];
    const answer = (body: unknown) => (init: GuardedFetchInit | undefined) => {
      headers.push(init?.headers ?? {});
      return body;
    };
    const ctx = {
      ...fakeContext(
        {
          [`${API}/accounts/${CURRENT}/balances`]: answer(balances(["XPCD", "1180.40"], ["ITBD", "1200.50"])),
          [`${API}/accounts/${SAVINGS}/balances`]: answer(balances(["CLAV", "25000.00"])),
          [`${API}/accounts/${other}/balances`]: answer(balances(["CLBD", "5000.00", "SEK"])),
        },
        { env: ENV }
      ),
      log: (m: string) => logs.push(m),
    };

    // When
    const values = await connector.fetch(request(["balance", "accounts"], `${CURRENT},${SAVINGS},${other}`), ctx);

    // Then
    expect(values).toEqual({ balance: money(26200.5, "eur"), accounts: number(3, { unit: "count" }) });
    expect(logs).toContain("1 bank account(s) in another currency than EUR: left out");
    for (const h of headers) {
      expect(Object.keys(h).filter((name) => name.toLowerCase().startsWith("psu-"))).toEqual([]);
      expect(await verifies(h.Authorization.replace("Bearer ", ""))).toBe(true);
    }
    expect(new Set(["balance", "accounts"].map((metric) => connector.cacheKey!({ metric, params: {} }))).size).toBe(1);
  });

  test("given only the account count is asked, when fetched, then no request is made", async () => {
    // Given
    const ctx = fakeContext({});

    // When
    const values = await enableBankingConnector.fetch(request(["accounts"]), ctx);

    // Then
    expect(values).toEqual({ accounts: number(2, { unit: "count" }) });
    expect(ctx.calls).toEqual([]);
  });

  test("given more accounts than the cap, when the balance is fetched, then only the first ones are read", async () => {
    // Given
    const uids = Array.from({ length: MAX_ACCOUNTS + 3 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const ctx = fakeContext({ [`${API}/accounts/`]: balances(["CLBD", "10.00"]) }, { env: ENV });

    // When
    const values = await connector.fetch(request(["balance"], uids.join(",")), ctx);

    // Then
    expect(ctx.calls).toHaveLength(MAX_ACCOUNTS);
    expect(values.balance).toEqual(money(100, "eur"));
  });

  test("given an expired, revoked or closed session, when the balance is fetched, then the owner is asked to reconnect their bank", async () => {
    // Given
    const cases = [
      fakeContext({ [`${API}/accounts/`]: (_init, url) => { throw new HttpError(401, url, JSON.stringify(fixture("error-expired-session"))); } }, { env: ENV }),
      fakeContext({ [`${API}/accounts/`]: refuse(401, "REVOKED_SESSION") }, { env: ENV }),
      fakeContext({ [`${API}/accounts/`]: refuse(400, "CLOSED_SESSION") }, { env: ENV }),
    ];

    // When
    const errors = await Promise.all(cases.map((ctx) => connector.fetch(request(["balance"]), ctx).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("Reconnect your bank: its consent ended.");
    }
  });

  test("given one account the bank stopped sharing, when fetched, then it's skipped, and when none is left the owner is told", async () => {
    // Given
    const one = fakeContext({ [`${API}/accounts/${CURRENT}`]: balances(["CLBD", "42.00"]), [`${API}/accounts/${SAVINGS}`]: refuse(403, "ASPSP_ACCOUNT_NOT_ACCESSIBLE") }, { env: ENV });
    const all = fakeContext({ [`${API}/accounts/`]: refuse(403, "ASPSP_ACCOUNT_NOT_ACCESSIBLE") }, { env: ENV });

    // When
    const values = await connector.fetch(request(["balance"]), one);
    const error = await connector.fetch(request(["balance"]), all).catch((e: unknown) => e);

    // Then
    expect(values.balance).toEqual(money(42, "eur"));
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("no longer shares");
  });

  test("given accounts without any balance, when fetched, then the balance is empty rather than zero", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/accounts/`]: { balances: [] } }, { env: ENV });

    // When
    const values = await connector.fetch(request(["balance"]), ctx);

    // Then
    expect(values.balance).toBeNull();
  });

  test("given a bank rate limit, a 401 without a code, or an outage, when fetched, then the error passes through without the key", async () => {
    // Given
    const cases = [
      fakeContext({ [`${API}/accounts/`]: refuse(429, "ASPSP_RATE_LIMIT_EXCEEDED") }, { env: ENV }),
      fakeContext({ [`${API}/accounts/`]: (_init, url) => { throw new HttpError(401, url, "Unauthorized"); } }, { env: ENV }),
      fakeContext({ [`${API}/accounts/`]: refuse(503, "ASPSP_ERROR") }, { env: ENV }),
    ];

    // When
    const errors = await Promise.all(cases.map((ctx) => connector.fetch(request(["balance"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as HttpError).status)).toEqual([429, 401, 503]);
    for (const error of errors) {
      expect(error).not.toBeInstanceOf(ConnectorError);
      expect((error as Error).message).not.toContain(PEM_BODY.slice(0, 16));
    }
  });
});

describe("disconnect", () => {
  const disconnect = connector.auth!.disconnect!;
  const shown = { bank: "Nordea", country: "FI", accounts: "2" };
  const stored = { session: SESSION, accounts: `${CURRENT},${SAVINGS}` };

  test("given a connection, when it is removed, then its session is deleted with a DELETE signed by the application's JWT", async () => {
    // Given
    const sent: { url: string; init: GuardedFetchInit | undefined }[] = [];
    const ctx = fakeContext(
      {
        [`${API}/sessions/`]: (init, url) => {
          sent.push({ url, init });
          return JSON.stringify({ message: "OK" });
        },
      },
      { env: ENV }
    );

    // When
    await disconnect({ secret: stored, public: shown }, ctx);

    // Then
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${API}/sessions/${SESSION}`);
    expect(sent[0].init?.method).toBe("DELETE");
    const jwt = String(sent[0].init?.headers?.Authorization).replace(/^Bearer /, "");
    expect(await verifies(jwt)).toBe(true);
    expect(decode(jwt.split(".")[0]).kid).toBe(APP_ID);
    expect(JSON.stringify(sent)).not.toContain(PEM_BODY);
  });

  test("given a session that expired, was closed or no longer exists, when the connection is removed, then it resolves", async () => {
    // Given
    const answers = [refuse(404, "SESSION_DOES_NOT_EXIST"), refuse(400, "CLOSED_SESSION"), refuse(422, "EXPIRED_SESSION"), refuse(422, "REVOKED_SESSION"), refuse(404, "NOT_FOUND")];

    // When
    const results = await Promise.all(answers.map((answer) => disconnect({ secret: stored, public: shown }, fakeContext({ [`${API}/sessions/`]: answer }, { env: ENV }))));

    // Then
    expect(results).toEqual(answers.map(() => undefined));
  });

  test("given no application on the server or no stored session, when the connection is removed, then it resolves without a request", async () => {
    // Given
    const noApp = fakeContext({}, { env: { ENABLE_BANKING_APP_ID: APP_ID } });
    const noSession = fakeContext({}, { env: ENV });

    // When
    await disconnect({ secret: stored, public: shown }, noApp);
    await disconnect({ secret: { accounts: CURRENT }, public: shown }, noSession);

    // Then
    expect([...noApp.calls, ...noSession.calls]).toEqual([]);
  });

  test("given Enable Banking refuses the application or fails, when the connection is removed, then it throws without the key or the session", async () => {
    // Given
    const refused = fakeContext({ [`${API}/sessions/`]: refuse(401, "UNAUTHORIZED_ACCESS") }, { env: ENV });
    const outage = fakeContext({ [`${API}/sessions/`]: refuse(500, "ASPSP_ERROR") }, { env: ENV });

    // When
    const errors = await Promise.all([refused, outage].map((ctx) => disconnect({ secret: stored, public: shown }, ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect(errors[1]).toBeInstanceOf(HttpError);
    for (const error of errors) {
      const message = (error as Error).message;
      expect(message).not.toContain(SESSION);
      expect(message).not.toContain(PEM_BODY);
    }
  });
});
