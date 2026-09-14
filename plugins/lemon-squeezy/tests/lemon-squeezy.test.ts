import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, money, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import lemonSqueezy, { lemonSqueezyConnector, MAX_PAGES, monthlyValue, type Price, type Subscription } from "../src/index";

/** Responses copied from the examples in Lemon Squeezy's API reference. */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const API = "https://api.lemonsqueezy.com/v1";
const KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIn0.c2VjcmV0LXNpZ25hdHVyZS1YWVo5";
const request = (metrics: string[], visible: Record<string, string> | null = { storeId: "1" }) => ({ metrics, params: {}, secret: { key: KEY }, public: visible });

/** The documented subscription, with what a test is about overridden. */
function aSubscription(over: { status?: string; pause?: object | null; priceId?: number; quantity?: number; noItem?: boolean } = {}): Subscription {
  const sub = fixture("subscriptions").data[0];
  if (over.status) sub.attributes.status = over.status;
  if (over.pause !== undefined) sub.attributes.pause = over.pause;
  if (over.noItem) sub.attributes.first_subscription_item = null;
  else {
    if (over.priceId !== undefined) sub.attributes.first_subscription_item.price_id = over.priceId;
    if (over.quantity !== undefined) sub.attributes.first_subscription_item.quantity = over.quantity;
  }
  return sub;
}

/** The documented price, turned into a standard monthly price unless overridden. */
function aPrice(over: Partial<Price["attributes"]> & { id?: string } = {}): Price {
  const price = fixture("price").data;
  const { id, ...attributes } = over;
  Object.assign(price.attributes, { scheme: "standard", tiers: null, renewal_interval_unit: "month", renewal_interval_quantity: 1 }, attributes);
  if (id) price.id = id;
  return price;
}

function aPage(subs: Subscription[], currentPage: number, lastPage: number, total: number) {
  const page = fixture("subscriptions");
  page.data = subs;
  page.meta.page = { ...page.meta.page, currentPage, lastPage, total };
  return page;
}

function aStore(over: Record<string, unknown>) {
  const store = fixture("store");
  Object.assign(store.data.attributes, over);
  return store;
}

describe("lemon-squeezy plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([lemonSqueezy]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given quantities, packages and yearly, quarterly or weekly prices, when MRR is computed, then everything is monthly", () => {
    // Given
    const seats = [aSubscription({ quantity: 3 }), aPrice({ unit_price: 1000 })];
    const yearly = [aSubscription({ quantity: 1 }), aPrice({ unit_price: 12000, renewal_interval_unit: "year" })];
    const quarterly = [aSubscription({ quantity: 1 }), aPrice({ unit_price: 3000, renewal_interval_quantity: 3 })];
    const weekly = [aSubscription({ quantity: 1 }), aPrice({ unit_price: 1200, renewal_interval_unit: "week" })];
    const packages = [aSubscription({ quantity: 25 }), aPrice({ unit_price: 500, scheme: "package", package_size: 10 })];

    // When
    const values = [seats, yearly, quarterly, weekly, packages].map(([s, p]) => monthlyValue(s as Subscription, p as Price));

    // Then
    expect(values[0]).toBe(3000);
    expect(values[1]).toBeCloseTo(1000);
    expect(values[2]).toBeCloseTo(1000);
    expect(values[3]).toBeCloseTo(5200);
    expect(values[4]).toBe(1500);
  });

  test("given cancelled, paused, trial, past due, usage-based, graduated and itemless subscriptions, when MRR is computed, then none of them count", () => {
    // Given
    const price = aPrice({ unit_price: 1000 });
    const cases: [Subscription, Price | undefined][] = [
      [aSubscription({ status: "cancelled" }), price],
      [aSubscription({ status: "paused" }), price],
      [aSubscription({ pause: { mode: "void", resumes_at: null } }), price],
      [aSubscription({ status: "on_trial" }), price],
      [aSubscription({ status: "past_due" }), price],
      [aSubscription({ status: "expired" }), price],
      [aSubscription(), aPrice({ usage_aggregation: "sum", unit_price: null })],
      [aSubscription(), fixture("price").data],
      [aSubscription({ noItem: true }), price],
      [aSubscription(), undefined],
    ];

    // When
    const total = cases.reduce((sum, [s, p]) => sum + monthlyValue(s, p), 0);

    // Then
    expect(total).toBe(0);
  });

  test("given a store in pounds, when every metric is fetched, then MRR is in pounds, revenue in dollars and each price is read once", async () => {
    // Given
    const accepts: string[] = [];
    const remember = (body: unknown) => (init?: GuardedFetchInit) => {
      accepts.push(init?.headers?.Accept ?? "");
      return body;
    };
    const subs = [aSubscription({ priceId: 1, quantity: 2 }), aSubscription({ priceId: 1, quantity: 1 }), aSubscription({ priceId: 2, quantity: 1 })];
    const ctx = fakeContext({
      [`${API}/stores/1`]: remember(aStore({ currency: "GBP", thirty_day_revenue: 123_456 })),
      [`${API}/subscriptions`]: remember(aPage(subs, 1, 1, 3)),
      [`${API}/prices/1`]: remember({ data: aPrice({ id: "1", unit_price: 1000 }) }),
      [`${API}/prices/2`]: remember({ data: aPrice({ id: "2", unit_price: 24000, renewal_interval_unit: "year" }) }),
    });

    // When
    const values = await lemonSqueezyConnector.fetch(request(["mrr", "active-subscriptions", "revenue-30d"]), ctx);

    // Then
    expect(values.mrr).toEqual(money(50, "gbp"));
    expect(values["active-subscriptions"]).toEqual(number(3, { unit: "count" }));
    expect(values["revenue-30d"]).toEqual(money(1235, "usd"));
    expect(ctx.calls.filter((u) => u.includes("/prices/"))).toHaveLength(2);
    expect(ctx.calls.find((u) => u.includes("/subscriptions"))).toContain("filter[status]=active");
    expect(accepts.every((a) => a === "application/vnd.api+json")).toBe(true);
    expect(new Set(["mrr", "active-subscriptions", "revenue-30d"].map((metric) => lemonSqueezyConnector.cacheKey!({ metric, params: {} }))).size).toBe(1);
  });

  test("given subscriptions over two pages, when MRR is fetched, then both pages count", async () => {
    // Given
    let served = 0;
    const ctx = fakeContext({
      [`${API}/stores/1`]: fixture("store"),
      [`${API}/subscriptions`]: () => (++served === 1 ? aPage([aSubscription({ quantity: 1 })], 1, 2, 2) : aPage([aSubscription({ quantity: 4 })], 2, 2, 2)),
      [`${API}/prices/1`]: { data: aPrice({ unit_price: 1000 }) },
    });

    // When
    const values = await lemonSqueezyConnector.fetch(request(["mrr", "active-subscriptions"]), ctx);

    // Then
    expect(ctx.calls.filter((u) => u.includes("/subscriptions"))).toEqual([
      `${API}/subscriptions?filter[store_id]=1&filter[status]=active&page[number]=1&page[size]=100`,
      `${API}/subscriptions?filter[store_id]=1&filter[status]=active&page[number]=2&page[size]=100`,
    ]);
    expect(values.mrr).toEqual(money(50, "usd"));
    expect(values["active-subscriptions"]).toEqual(number(2, { unit: "count" }));
  });

  test("given a store with endless pages, when MRR is fetched, then walking stops at the cap and the count stays exact", async () => {
    // Given
    let served = 0;
    const ctx = fakeContext({
      [`${API}/stores/1`]: fixture("store"),
      [`${API}/subscriptions`]: () => aPage([aSubscription({ quantity: 1 })], ++served, 10_000, 1_000_000),
      [`${API}/prices/1`]: { data: aPrice({ unit_price: 100 }) },
    });

    // When
    const values = await lemonSqueezyConnector.fetch(request(["mrr", "active-subscriptions"]), ctx);

    // Then
    expect(ctx.calls.filter((u) => u.includes("/subscriptions"))).toHaveLength(MAX_PAGES);
    expect(values.mrr).toEqual(money(MAX_PAGES, "usd"));
    expect(values["active-subscriptions"]).toEqual(number(1_000_000, { unit: "count" }));
  });

  test("given only the count is wanted, when fetched, then one page answers it and no price is read", async () => {
    // Given
    const ctx = fakeContext({
      [`${API}/stores/1`]: fixture("store"),
      [`${API}/subscriptions`]: aPage([aSubscription()], 1, 40, 3_990),
    });

    // When
    const values = await lemonSqueezyConnector.fetch(request(["active-subscriptions"]), ctx);

    // Then
    expect(values).toEqual({ "active-subscriptions": number(3_990, { unit: "count" }) });
    expect(ctx.calls).toHaveLength(2);
  });

  test("given only revenue is wanted, when fetched, then no subscription is walked", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/stores/1`]: aStore({ thirty_day_revenue: 99_900 }) });

    // When
    const values = await lemonSqueezyConnector.fetch(request(["revenue-30d"]), ctx);

    // Then
    expect(values).toEqual({ "revenue-30d": money(999, "usd") });
    expect(ctx.calls).toEqual([`${API}/stores/1`]);
  });

  test("given a valid key for one store, when connecting, then the store is described without the key", async () => {
    // Given
    const ctx = fakeContext({ [`${API}/users/me`]: fixture("users-me"), [`${API}/stores?`]: fixture("stores") });

    // When
    const result = await lemonSqueezyConnector.connect!({ key: KEY }, ctx);

    // Then
    expect(result.secret).toEqual({ key: KEY });
    expect(result.public).toEqual({ hint: "…WVo5", store: "My Store", storeId: "1", currency: "usd", mode: "live" });
    expect(result.label).toBe("Lemon Squeezy: My Store");
    expect(result.accountId).toBe("1-live");
    const shown = JSON.stringify([result.public, result.label, result.accountId]);
    expect(shown).not.toContain(KEY);
    expect(shown).not.toContain(KEY.slice(0, 40));
    expect(validateFields(lemonSqueezyConnector.auth!.fields, { key: KEY }).error).toBeNull();
    expect(validateFields(lemonSqueezyConnector.auth!.fields, { key: "sk_live_nope" }).error).toBe("API key must be a Lemon Squeezy API key, starting with eyJ.");
  });

  test("given a key that sees two stores and no store typed, when connecting, then the owner is asked to pick one", async () => {
    // Given
    const stores = fixture("stores");
    const second = structuredClone(stores.data[0]);
    Object.assign(second, { id: "2" });
    Object.assign(second.attributes, { name: "Side Project", slug: "side-project" });
    stores.data.push(second);
    const ctx = fakeContext({ [`${API}/users/me`]: fixture("users-me"), [`${API}/stores?`]: stores });

    // When
    const unpicked = lemonSqueezyConnector.connect!({ key: KEY }, ctx);
    const picked = await lemonSqueezyConnector.connect!({ key: KEY, store: "Side-Project" }, ctx);

    // Then
    await expect(unpicked).rejects.toThrow("my-store, side-project");
    expect(picked.public.storeId).toBe("2");
    expect(picked.accountId).toBe("2-live");
  });

  test("given a revoked key, when connecting or fetching, then the owner gets a sentence that doesn't repeat the key", async () => {
    // Given
    const refuse = (status: number) => () => {
      throw new HttpError(status, `${API}/users/me`, '{"errors":[{"detail":"Unauthenticated.","status":"401","title":"Unauthorized"}]}');
    };
    const ctx = fakeContext({ [`${API}/users/me`]: refuse(401), [`${API}/stores/1`]: refuse(401) });

    // When
    const connecting = lemonSqueezyConnector.connect!({ key: KEY }, ctx).catch((e: unknown) => e);
    const fetching = lemonSqueezyConnector.fetch(request(["mrr"]), ctx).catch((e: unknown) => e);

    // Then
    for (const error of await Promise.all([connecting, fetching])) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toContain("refused the key");
      expect((error as Error).message).not.toContain(KEY.slice(-4));
    }
  });

  test("given a store Lemon Squeezy forbids, when fetched, then the sentence is about access to the store", async () => {
    // Given
    const ctx = fakeContext({
      [`${API}/stores/1`]: () => {
        throw new HttpError(403, `${API}/stores/1`, "");
      },
    });

    // When
    const attempt = lemonSqueezyConnector.fetch(request(["mrr"]), ctx);

    // Then
    await expect(attempt).rejects.toThrow("refused access to this store");
  });

  test("given an outage, when fetched, then the error passes through untouched", async () => {
    // Given
    const outage = new HttpError(503, `${API}/stores/1`, "");
    const ctx = fakeContext({
      [`${API}/stores/1`]: () => {
        throw outage;
      },
    });

    // When
    const attempt = lemonSqueezyConnector.fetch(request(["mrr"]), ctx);

    // Then
    await expect(attempt).rejects.toBe(outage);
  });
});
