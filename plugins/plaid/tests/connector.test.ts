import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { bucketOf, finishedItem, HOSTS, mainCurrency, OPTIONAL_PRODUCTS, plaidConnector, PRODUCTS, type Account, type LinkSession } from "../src/index";

/**
 * Fixtures are the examples of Plaid's API reference and Hosted Link guide
 * (plaid-openapi 2020-09-14), trimmed. No response was recorded from a real
 * Plaid account.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = HOSTS.sandbox;
const CLIENT_ID = "5f1a2b3c4d5e6f7a8b9c0d1e";
const SECRET = "0123456789abcdef0123456789abcd";
const ENV = { PLAID_CLIENT_ID: CLIENT_ID, PLAID_SECRET: SECRET };
const REDIRECT = "https://flexwall.lol/api/connections/oauth/callback";
const STATE = "3a57e2d3-2e0c-4336-af9b-7fa94f0606a3";
const LINK_TOKEN = "link-sandbox-9b48eb4c-7e1b-44e1-b80d-faa1d71cdf5e";
const PUBLIC_TOKEN = "public-sandbox-d1e64436-f033-4302-a469-b90656edf8c7";
const ACCESS_TOKEN = "access-sandbox-de3ce8ef-33f8-452c-a685-8671031fc0f6";

const oauth = plaidConnector.auth!.oauth!;

/** A Plaid error answer, shaped like the error reference. */
const plaidError = (status: number, error_type: string, error_code: string) => (_init: GuardedFetchInit | undefined, url: string) => {
  throw new HttpError(status, url, JSON.stringify({ error_type, error_code, error_message: "…", display_message: null, request_id: "HNTDNrA8F1shFEW" }));
};
const account = (type: string, current: number | null, currency: string | null = "USD", extra: Partial<Account["balances"]> = {}, id = `${type}-${current}-${currency}`): Account => ({
  account_id: id,
  type,
  subtype: null,
  mask: "0000",
  balances: { available: null, current, iso_currency_code: currency, unofficial_currency_code: currency ? null : "BTC", limit: null, ...extra },
});
const request = (metrics: string[], secret: Record<string, string> | null = { accessToken: ACCESS_TOKEN }) => ({ metrics, params: {}, secret, public: { institution: "Royal Bank of Plaid", country: "US", accounts: "3" } });
const leaks = (text: string) => [SECRET, CLIENT_ID, ACCESS_TOKEN, PUBLIC_TOKEN, LINK_TOKEN].filter((s) => text.includes(s));

describe("plaid plugin", () => {
  test("given the plugin, when checked, then it has no problems, signs in without connect or refresh, and every metric is sensitive", () => {
    // Given
    const def = plugin.connectors![0];

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
    expect(def.connect).toBeUndefined();
    expect(def.auth?.oauth?.refresh).toBeUndefined();
    expect(def.tier).toBe("pro");
    expect(def.verified).toBe(true);
    expect(def.ttl).toBeGreaterThanOrEqual(6 * 3600);
    expect(def.metrics.map((m) => [m.id, m.unit, m.sensitive ?? false, m.leaderboard ?? null])).toEqual([
      ["cash", "currency", true, null],
      ["investments", "currency", true, null],
      ["net-worth", "currency", true, "wealth"],
    ]);
    expect(new Set(def.metrics.map((m) => def.cacheKey!({ metric: m.id, params: {} }))).size).toBe(1);
    expect(validateFields(def.auth!.fields, { country: "CA" }).error).toBeNull();
    expect(validateFields(def.auth!.fields, { country: "FR" }).error).not.toBeNull();
  });

  test("given no Plaid app on the server, when authorizing, completing or fetching, then the owner is told before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: { PLAID_CLIENT_ID: CLIENT_ID } });

    // When
    const errors = await Promise.all([
      oauth.authorize({ fields: { country: "US" }, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e),
      oauth.complete({ fields: { country: "US" }, query: { state: STATE }, redirectUri: REDIRECT, carry: { linkToken: LINK_TOKEN } }, ctx).catch((e: unknown) => e),
      plaidConnector.fetch(request(["cash"]), ctx).catch((e: unknown) => e),
    ]);

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("This Flexwall server has no Plaid app.");
    }
    expect(ctx.calls).toEqual([]);
  });

  test("given production or an unknown PLAID_ENV, when authorizing, then production calls production.plaid.com and a typo is a sentence without a request", async () => {
    // Given
    const production = fakeContext({ [`${HOSTS.production}/link/token/create`]: fixture("link-token-create") }, { env: { ...ENV, PLAID_ENV: "production" } });
    const typo = fakeContext({}, { env: { ...ENV, PLAID_ENV: "development" } });
    const input = { fields: { country: "US" }, redirectUri: REDIRECT, state: STATE };

    // When
    await oauth.authorize(input, production);
    const error = await oauth.authorize(input, typo).catch((e: unknown) => e);

    // Then
    expect(production.calls).toEqual([`${HOSTS.production}/link/token/create`]);
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as Error).message).toContain("PLAID_ENV");
    expect(typo.calls).toEqual([]);
  });

  test("given a Canadian bank, when authorizing, then a Hosted Link token is created with the keys in headers, transactions required, investments optional and the state in the completion address", async () => {
    // Given
    let sent: { body: Record<string, unknown>; init: GuardedFetchInit } | null = null;
    const ctx = fakeContext(
      {
        [`${API}/link/token/create`]: (init) => {
          sent = { body: JSON.parse(String(init?.body)), init: init! };
          return fixture("link-token-create");
        },
      },
      { env: ENV }
    );

    // When
    const result = await oauth.authorize({ fields: { country: "CA" }, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(result.url).toBe("https://secure.plaid.com/hl/lp9o97618r1r6p93oon62nr025950ro4s3");
    expect(result.carry).toEqual({ linkToken: "link-production-4b42163e-6e1c-48bb-a17a-e570405eb9f8" });
    expect(sent!.init.method).toBe("POST");
    expect(sent!.init.headers).toEqual({ "Content-Type": "application/json", "PLAID-CLIENT-ID": CLIENT_ID, "PLAID-SECRET": SECRET });
    const { user, ...rest } = sent!.body;
    expect(rest).toEqual({
      client_name: "Flexwall",
      language: "en",
      country_codes: ["CA"],
      products: [...PRODUCTS],
      optional_products: [...OPTIONAL_PRODUCTS],
      hosted_link: { completion_redirect_uri: `${REDIRECT}?state=${STATE}` },
    });
    expect(rest).not.toHaveProperty("redirect_uri");
    expect((user as { client_user_id: string }).client_user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(sent!.body)).not.toContain(SECRET);
    expect(leaks(result.url)).toEqual([]);
    expect(result.url).not.toContain("link-production-4b42163e");
  });

  test("given two sign-ins, when authorizing, then each gets its own random Plaid user id", async () => {
    // Given
    const ids: string[] = [];
    const ctx = fakeContext(
      {
        [`${API}/link/token/create`]: (init) => {
          ids.push(JSON.parse(String(init?.body)).user.client_user_id);
          return fixture("link-token-create");
        },
      },
      { env: ENV }
    );

    // When
    await oauth.authorize({ fields: { country: "US" }, redirectUri: REDIRECT, state: STATE }, ctx);
    await oauth.authorize({ fields: { country: "US" }, redirectUri: REDIRECT, state: STATE }, ctx);

    // Then
    expect(ids[0]).not.toBe(ids[1]);
  });

  test("given Plaid refuses the server's keys, or answers without a Hosted Link address, when authorizing, then keys are a sentence without the secret and the rest passes through", async () => {
    // Given
    const refused = fakeContext({ [`${API}/link/token/create`]: plaidError(400, "INVALID_INPUT", "INVALID_API_KEYS") }, { env: ENV });
    const notHosted = fakeContext({ [`${API}/link/token/create`]: { link_token: LINK_TOKEN, expiration: "2026-09-15T12:00:00Z", request_id: "x" } }, { env: ENV });

    // When
    const errors = await Promise.all([refused, notHosted].map((ctx) => oauth.authorize({ fields: { country: "US" }, redirectUri: REDIRECT, state: STATE }, ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toBe("Plaid refused this Flexwall server's keys.");
    expect(errors[1]).not.toBeInstanceOf(ConnectorError);
    for (const error of errors) expect(leaks((error as Error).message)).toEqual([]);
  });

  test("given a finished Hosted Link session, when completing, then its public token is exchanged and only the access token is secret", async () => {
    // Given
    const bodies: Record<string, Record<string, unknown>> = {};
    const capture = (name: string, answer: unknown) => (init: GuardedFetchInit | undefined) => {
      bodies[name] = JSON.parse(String(init?.body));
      expect(init?.headers?.["PLAID-SECRET"]).toBe(SECRET);
      return answer;
    };
    const ctx = fakeContext(
      {
        [`${API}/link/token/get`]: capture("get", fixture("link-token-get")),
        [`${API}/item/public_token/exchange`]: capture("exchange", fixture("exchange")),
      },
      { env: ENV }
    );

    // When
    const result = await oauth.complete({ fields: { country: "US" }, query: { state: STATE }, redirectUri: REDIRECT, carry: { linkToken: LINK_TOKEN } }, ctx);

    // Then
    expect(bodies.get).toEqual({ link_token: LINK_TOKEN });
    expect(bodies.exchange).toEqual({ public_token: PUBLIC_TOKEN });
    expect(ctx.calls).toEqual([`${API}/link/token/get`, `${API}/item/public_token/exchange`]);
    expect(result.secret).toEqual({ accessToken: ACCESS_TOKEN });
    expect(result.public).toEqual({ institution: "American Express", country: "US", accounts: "1" });
    expect(result.label).toBe("American Express");
    expect(result.accountId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBeUndefined();
    expect(leaks(JSON.stringify([result.public, result.label, result.accountId]))).toEqual([]);
  });

  test("given the same bank and accounts linked twice, when completing, then the account id doesn't change although Plaid's item id does", async () => {
    // Given
    const second = fixture("link-token-get");
    second.link_sessions[0].results.item_add_results[0].public_token = "public-sandbox-00000000-0000-4000-8000-000000000000";
    const ctxFor = (session: unknown, itemId: string) =>
      fakeContext({ [`${API}/link/token/get`]: session as Record<string, unknown>, [`${API}/item/public_token/exchange`]: { ...fixture("exchange"), item_id: itemId } }, { env: ENV });
    const input = { fields: { country: "US" }, query: { state: STATE }, redirectUri: REDIRECT, carry: { linkToken: LINK_TOKEN } };

    // When
    const [a, b] = await Promise.all([oauth.complete(input, ctxFor(fixture("link-token-get"), "item-a")), oauth.complete(input, ctxFor(second, "item-b"))]);

    // Then
    expect(a.accountId).toBe(b.accountId!);
  });

  test("given the owner left Link, no session, a lost link token or an expired one, when completing, then nothing is exchanged and the owner is told it didn't finish", async () => {
    // Given
    const exited = { ...fixture("link-token-get"), link_sessions: [{ link_session_id: "s1", started_at: "2024-07-29T21:22:17Z", finished_at: "2024-07-29T21:23:03Z", exit: { error: null }, results: { item_add_results: [] } }] };
    const cases: { ctx: ReturnType<typeof fakeContext>; carry: Record<string, string> }[] = [
      { ctx: fakeContext({ [`${API}/link/token/get`]: exited }, { env: ENV }), carry: { linkToken: LINK_TOKEN } },
      { ctx: fakeContext({ [`${API}/link/token/get`]: { ...fixture("link-token-get"), link_sessions: [] } }, { env: ENV }), carry: { linkToken: LINK_TOKEN } },
      { ctx: fakeContext({}, { env: ENV }), carry: {} },
      { ctx: fakeContext({ [`${API}/link/token/get`]: plaidError(400, "INVALID_INPUT", "INVALID_LINK_TOKEN") }, { env: ENV }), carry: { linkToken: LINK_TOKEN } },
    ];

    // When
    const errors = await Promise.all(cases.map(({ ctx, carry }) => oauth.complete({ fields: { country: "US" }, query: { state: STATE }, redirectUri: REDIRECT, carry }, ctx).catch((e: unknown) => e)));

    // Then
    for (const [i, error] of errors.entries()) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("The bank connection didn't finish.");
      expect(cases[i].ctx.calls).not.toContain(`${API}/item/public_token/exchange`);
    }
  });

  test("given the exchange fails, when completing, then a used public token is a sentence, an outage passes through, and neither echoes a token", async () => {
    // Given
    const used = fakeContext({ [`${API}/link/token/get`]: fixture("link-token-get"), [`${API}/item/public_token/exchange`]: plaidError(400, "INVALID_INPUT", "INVALID_PUBLIC_TOKEN") }, { env: ENV });
    const outage = fakeContext({ [`${API}/link/token/get`]: fixture("link-token-get"), [`${API}/item/public_token/exchange`]: plaidError(500, "API_ERROR", "INTERNAL_SERVER_ERROR") }, { env: ENV });
    const input = { fields: { country: "US" }, query: { state: STATE }, redirectUri: REDIRECT, carry: { linkToken: LINK_TOKEN } };

    // When
    const errors = await Promise.all([oauth.complete(input, used).catch((e: unknown) => e), oauth.complete(input, outage).catch((e: unknown) => e)]);

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toBe("That Plaid sign-in expired or was already used. Connect again.");
    expect(errors[1]).toBeInstanceOf(HttpError);
    expect((errors[1] as HttpError).status).toBe(500);
    for (const error of errors) expect(leaks((error as Error).message)).toEqual([]);
  });

  test("given several sessions on one link token, when the finished item is picked, then the latest with a public token wins and on_success is a fallback", () => {
    // Given
    const early: LinkSession = { link_session_id: "a", finished_at: "2026-09-15T08:00:00Z", results: { item_add_results: [{ public_token: "public-early", accounts: [], institution: { name: "Early" } }] } };
    const late: LinkSession = { link_session_id: "b", finished_at: "2026-09-15T09:00:00Z", results: { item_add_results: [{ public_token: "public-late", accounts: [], institution: { name: "Late" } }] } };
    const exited: LinkSession = { link_session_id: "c", finished_at: "2026-09-15T10:00:00Z", results: null };
    const legacy: LinkSession = { link_session_id: "d", finished_at: "2026-09-15T08:30:00Z", on_success: { public_token: "public-legacy", metadata: { institution: { name: "Legacy" } } } };

    // When
    const picks = [finishedItem([early, exited, late]), finishedItem([legacy, exited]), finishedItem([exited])];

    // Then
    expect(picks.map((p) => p?.public_token ?? null)).toEqual(["public-late", "public-legacy", null]);
    expect(picks[1]?.institution?.name).toBe("Legacy");
  });

  test("given the documented accounts, when every metric is fetched, then cash, investments and net worth less the loan come from one free /accounts/get", async () => {
    // Given
    let body: unknown = null;
    const ctx = fakeContext(
      {
        [`${API}/accounts/get`]: (init) => {
          body = JSON.parse(String(init?.body));
          return fixture("accounts");
        },
      },
      { env: ENV }
    );

    // When
    const values = await plaidConnector.fetch(request(["cash", "investments", "net-worth"]), ctx);

    // Then
    expect(values).toEqual({
      cash: money(110, "usd"),
      investments: money(23631.98, "usd"),
      "net-worth": money(-41520.02, "usd"),
    });
    expect(body).toEqual({ access_token: ACCESS_TOKEN });
    expect(ctx.calls).toEqual([`${API}/accounts/get`]);
    expect(ctx.calls.join()).not.toContain("/accounts/balance/get");
  });

  test("given deposit, investment, card, loan and other accounts, when net worth is fetched, then cards and loans are subtracted, a card in credit adds, and other accounts are ignored", async () => {
    // Given
    const accounts = [
      account("depository", 1000),
      account("depository", null, "USD", { available: 250 }),
      account("investment", 5000),
      account("brokerage", 700),
      account("credit", 300),
      account("credit", -20),
      account("loan", 1200),
      account("other", 99999),
    ];
    const ctx = fakeContext({ [`${API}/accounts/get`]: { accounts, item: {}, request_id: "r" } }, { env: ENV });

    // When
    const values = await plaidConnector.fetch(request(["net-worth", "cash"]), ctx);

    // Then
    expect(values.cash).toEqual(money(1250, "usd"));
    expect(values["net-worth"]).toEqual(money(1250 + 5700 - 300 + 20 - 1200, "usd"));
    expect(values).not.toHaveProperty("investments");
  });

  test("given accounts in USD, CAD and a crypto currency, when cash is fetched, then the most common ISO currency is kept and the rest is logged", async () => {
    // Given
    const logs: string[] = [];
    const accounts = [account("depository", 10, "CAD", {}, "c1"), account("depository", 20, "USD", {}, "u1"), account("investment", 30, "cad", {}, "c2"), account("depository", 40, null, {}, "b1")];
    const ctx = { ...fakeContext({ [`${API}/accounts/get`]: { accounts, item: {}, request_id: "r" } }, { env: ENV }), log: (m: string) => logs.push(m) };

    // When
    const values = await plaidConnector.fetch(request(["cash", "investments"]), ctx);

    // Then
    expect(values).toEqual({ cash: money(10, "cad"), investments: money(30, "cad") });
    expect(logs).toContain("plaid: 1 account(s) in another currency than CAD: left out");
    expect(logs).toContain("plaid: 1 account(s) without an ISO currency (crypto or unofficial): left out");
  });

  test("given as many accounts in two currencies, when the currency is picked, then the tie goes to the first code alphabetically whatever the order", () => {
    // Given
    const usd = account("depository", 1, "USD", {}, "u");
    const cad = account("depository", 1, "CAD", {}, "c");

    // When
    const picks = [mainCurrency([usd, cad]), mainCurrency([cad, usd]), mainCurrency([])];

    // Then
    expect(picks).toEqual(["CAD", "CAD", null]);
    expect([bucketOf("depository"), bucketOf("brokerage"), bucketOf("loan"), bucketOf("other")]).toEqual(["cash", "investments", "debt", null]);
  });

  test("given an investment account without a balance, when investments are fetched, then its holdings are valued from /investments/holdings/get", async () => {
    // Given
    const accounts = [account("investment", null, "USD", {}, "JqMLm4rJwpF6gMPJwBqdh9ZjjPvvpDcb7kDK1"), account("investment", 1000, "USD", {}, "k67E4xKvMlhmleEa4pg9hlwGGNnnEeixPolGm")];
    const ctx = fakeContext({ [`${API}/accounts/get`]: { accounts, item: {}, request_id: "r" }, [`${API}/investments/holdings/get`]: fixture("holdings") }, { env: ENV });

    // When
    const values = await plaidConnector.fetch(request(["investments"]), ctx);

    // Then
    expect(values.investments).toEqual(money(1000 + 0.01 + 110, "usd"));
    expect(ctx.calls).toEqual([`${API}/accounts/get`, `${API}/investments/holdings/get`]);
  });

  test("given an investment account without a balance on an Item without Investments, when investments are fetched, then it counts as 0", async () => {
    // Given
    const accounts = [account("depository", 500), account("investment", null)];
    const cases = ["PRODUCTS_NOT_SUPPORTED", "NO_INVESTMENT_ACCOUNTS", "PRODUCT_NOT_ENABLED"].map((code) =>
      fakeContext({ [`${API}/accounts/get`]: { accounts, item: {}, request_id: "r" }, [`${API}/investments/holdings/get`]: plaidError(400, "ITEM_ERROR", code) }, { env: ENV })
    );

    // When
    const values = await Promise.all(cases.map((ctx) => plaidConnector.fetch(request(["investments", "net-worth"]), ctx)));

    // Then
    for (const v of values) expect(v).toEqual({ investments: money(0, "usd"), "net-worth": money(500, "usd") });
  });

  test("given only cash is asked, or a bank without investment accounts, when fetched, then holdings are never requested and investments are 0", async () => {
    // Given
    const accounts = [account("depository", 500), account("investment", null)];
    const cashOnly = fakeContext({ [`${API}/accounts/get`]: { accounts, item: {}, request_id: "r" } }, { env: ENV });
    const bankOnly = fakeContext({ [`${API}/accounts/get`]: { accounts: [account("depository", 500)], item: {}, request_id: "r" } }, { env: ENV });

    // When
    const cash = await plaidConnector.fetch(request(["cash"]), cashOnly);
    const investments = await plaidConnector.fetch(request(["investments"]), bankOnly);

    // Then
    expect(cash).toEqual({ cash: money(500, "usd") });
    expect(investments).toEqual({ investments: money(0, "usd") });
    expect([...cashOnly.calls, ...bankOnly.calls]).toEqual([`${API}/accounts/get`, `${API}/accounts/get`]);
  });

  test("given a Canadian connection with no priced account, when cash is fetched, then 0 comes back in Canadian dollars", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/accounts/get`]: { accounts: [], item: {}, request_id: "r" } }, { env: ENV });

    // When
    const values = await plaidConnector.fetch({ ...request(["cash"]), public: { institution: "RBC Royal Bank", country: "CA", accounts: "0" } }, ctx);

    // Then
    expect(values.cash).toEqual(money(0, "cad"));
  });

  test("given the bank wants a new sign-in, access was withdrawn or the Item is gone, when fetched, then the owner is asked to reconnect that institution without any token", async () => {
    // Given
    const cases = [
      ["ITEM_ERROR", "ITEM_LOGIN_REQUIRED", "Reconnect Royal Bank of Plaid in Plaid: the bank wants you to sign in again."],
      ["ITEM_ERROR", "ACCESS_NOT_GRANTED", "Reconnect Royal Bank of Plaid in Plaid: it no longer shares these accounts."],
      ["ITEM_ERROR", "ITEM_NOT_FOUND", "Reconnect Royal Bank of Plaid in Plaid: this connection was removed or belongs to another Plaid environment."],
      ["INVALID_INPUT", "INVALID_ACCESS_TOKEN", "Reconnect Royal Bank of Plaid in Plaid: this connection was removed or belongs to another Plaid environment."],
      ["INVALID_INPUT", "INVALID_API_KEYS", "Plaid refused this Flexwall server's keys."],
    ] as const;

    // When
    const errors = await Promise.all(
      cases.map(([type, code]) => plaidConnector.fetch(request(["net-worth"]), fakeContext({ [`${API}/accounts/get`]: plaidError(400, type, code) }, { env: ENV })).catch((e: unknown) => e))
    );

    // Then
    for (const [i, error] of errors.entries()) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe(cases[i][2]);
      expect(leaks((error as Error).message)).toEqual([]);
    }
  });

  test("given a missing access token, when fetched, then the owner is asked to reconnect before any request", async () => {
    // Given
    const ctx = fakeContext({}, { env: ENV });

    // When
    const error = await plaidConnector.fetch(request(["cash"], {}), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(ConnectorError);
    expect(ctx.calls).toEqual([]);
  });

  test("given a rate limit, a holdings product not ready, or an outage, when fetched, then the error passes through so the tile keeps its last value", async () => {
    // Given
    const cases = [
      fakeContext({ [`${API}/accounts/get`]: plaidError(429, "RATE_LIMIT_EXCEEDED", "ACCOUNTS_LIMIT") }, { env: ENV }),
      fakeContext({ [`${API}/accounts/get`]: { accounts: [account("investment", null)], item: {}, request_id: "r" }, [`${API}/investments/holdings/get`]: plaidError(400, "ITEM_ERROR", "PRODUCT_NOT_READY") }, { env: ENV }),
      fakeContext({ [`${API}/accounts/get`]: plaidError(502, "INSTITUTION_ERROR", "INSTITUTION_DOWN") }, { env: ENV }),
    ];

    // When
    const errors = await Promise.all(cases.map((ctx) => plaidConnector.fetch(request(["investments"]), ctx).catch((e: unknown) => e)));

    // Then
    expect(errors.map((e) => (e as HttpError).status)).toEqual([429, 400, 502]);
    for (const error of errors) {
      expect(error).not.toBeInstanceOf(ConnectorError);
      expect(leaks((error as Error).message)).toEqual([]);
    }
  });
});

describe("disconnect", () => {
  const disconnect = plaidConnector.auth!.disconnect!;
  const shown = { institution: "Royal Bank of Plaid", country: "US", accounts: "3" };

  test("given a connection, when it is removed, then its Item is removed at Plaid with the stored access token and the server's keys in headers", async () => {
    // Given
    const sent: { url: string; init: GuardedFetchInit | undefined }[] = [];
    const ctx = fakeContext(
      {
        [`${API}/item/remove`]: (init, url) => {
          sent.push({ url, init });
          return { request_id: "m8MDnv9okwxFNBV" };
        },
      },
      { env: ENV }
    );

    // When
    await disconnect({ secret: { accessToken: ACCESS_TOKEN }, public: shown }, ctx);

    // Then
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${API}/item/remove`);
    expect(sent[0].init?.method).toBe("POST");
    expect(sent[0].init?.headers).toMatchObject({ "Content-Type": "application/json", "PLAID-CLIENT-ID": CLIENT_ID, "PLAID-SECRET": SECRET });
    expect(JSON.parse(String(sent[0].init?.body))).toEqual({ access_token: ACCESS_TOKEN });
  });

  test("given an Item Plaid no longer knows, when the connection is removed, then it resolves", async () => {
    // Given
    const answers = [plaidError(400, "ITEM_ERROR", "ITEM_NOT_FOUND"), plaidError(400, "INVALID_INPUT", "INVALID_ACCESS_TOKEN")];

    // When
    const results = await Promise.all(answers.map((answer) => disconnect({ secret: { accessToken: ACCESS_TOKEN }, public: shown }, fakeContext({ [`${API}/item/remove`]: answer }, { env: ENV }))));

    // Then
    expect(results).toEqual([undefined, undefined]);
  });

  test("given no Plaid app on the server or no stored token, when the connection is removed, then it resolves without a request", async () => {
    // Given
    const noApp = fakeContext({}, { env: { PLAID_CLIENT_ID: CLIENT_ID } });
    const noToken = fakeContext({}, { env: ENV });

    // When
    await disconnect({ secret: { accessToken: ACCESS_TOKEN }, public: shown }, noApp);
    await disconnect({ secret: {}, public: shown }, noToken);

    // Then
    expect([...noApp.calls, ...noToken.calls]).toEqual([]);
  });

  test("given Plaid refuses the keys or fails, when the connection is removed, then it throws without a key or the access token", async () => {
    // Given
    const refused = fakeContext({ [`${API}/item/remove`]: plaidError(400, "INVALID_INPUT", "INVALID_API_KEYS") }, { env: ENV });
    const outage = fakeContext({ [`${API}/item/remove`]: plaidError(500, "API_ERROR", "INTERNAL_SERVER_ERROR") }, { env: ENV });

    // When
    const errors = await Promise.all([refused, outage].map((ctx) => disconnect({ secret: { accessToken: ACCESS_TOKEN }, public: shown }, ctx).catch((e: unknown) => e)));

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect(errors[1]).toBeInstanceOf(HttpError);
    for (const error of errors) expect(leaks((error as Error).message)).toEqual([]);
  });
});
