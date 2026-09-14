import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import stripe, { dailyRevenue, monthlyValue, stripeConnector, toMajor, type Subscription } from "../src/index";

const NOW = 1_790_000_000;

/** A subscription with the fields MRR reads; tests override what they're about. */
function aSubscription(over: Partial<Subscription>, items: { amount: number | null; qty?: number; interval?: string; count?: number; metered?: boolean }[]): Subscription {
  return {
    id: "sub_1",
    status: "active",
    currency: "usd",
    pause_collection: null,
    discounts: [],
    items: { data: items.map((i) => ({ quantity: i.qty ?? 1, price: { unit_amount: i.amount, recurring: { interval: i.interval ?? "month", interval_count: i.count ?? 1, usage_type: i.metered ? "metered" : "licensed" } } })) },
    ...over,
  };
}
const aCoupon = (c: object, end: number | null = null) => ({ end, source: { coupon: { duration: "forever" as const, percent_off: null, amount_off: null, currency: null, ...c } } });

describe("stripe plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When / Then
    expect(checkPlugins([stripe])).toEqual([]);
  });

  test("given quantities and yearly or quarterly prices, when MRR is computed, then everything is monthly", () => {
    // Given
    const seats = aSubscription({}, [{ amount: 1000, qty: 3 }]);
    const yearly = aSubscription({}, [{ amount: 12000, interval: "year" }]);
    const quarterly = aSubscription({}, [{ amount: 3000, count: 3 }]);

    // When
    const values = [seats, yearly, quarterly].map((s) => monthlyValue(s, "usd", NOW));

    // Then
    expect(values[0]).toBe(3000);
    expect(values[1]).toBeCloseTo(1000);
    expect(values[2]).toBeCloseTo(1000);
  });

  test("given trials, other currencies, paused and metered subscriptions, when MRR is computed, then none of them count", () => {
    // Given
    const subs = [
      aSubscription({ status: "trialing" }, [{ amount: 1000 }]),
      aSubscription({ currency: "eur" }, [{ amount: 1000 }]),
      aSubscription({ pause_collection: {} }, [{ amount: 1000 }]),
      aSubscription({}, [{ amount: 1000, metered: true }, { amount: null }]),
    ];

    // When
    const total = subs.reduce((sum, s) => sum + monthlyValue(s, "usd", NOW), 0);

    // Then
    expect(total).toBe(0);
  });

  test("given running, expired and one-time coupons, when MRR is computed, then only running ones apply", () => {
    // Given
    const half = aSubscription({ discounts: [aCoupon({ percent_off: 50 })] }, [{ amount: 2000 }]);
    const fiveOff = aSubscription({ discounts: [aCoupon({ amount_off: 500, currency: "usd" })] }, [{ amount: 2000 }]);
    const expired = aSubscription({ discounts: [aCoupon({ percent_off: 50 }, NOW - 1)] }, [{ amount: 2000 }]);
    const once = aSubscription({ discounts: [aCoupon({ percent_off: 50, duration: "once" })] }, [{ amount: 2000 }]);

    // When
    const values = [half, fiveOff, expired, once].map((s) => monthlyValue(s, "usd", NOW));

    // Then
    expect(values).toEqual([1000, 1500, 2000, 2000]);
  });

  test("given charges, refunds, payouts and foreign charges, when daily revenue is computed, then refunds net out and the rest is ignored", () => {
    // Given
    const day = (d: number) => NOW - d * 86_400;
    const transactions = [
      { id: "1", type: "charge", amount: 5000, currency: "usd", created: day(0) },
      { id: "2", type: "refund", amount: -1000, currency: "usd", created: day(0) },
      { id: "3", type: "payout", amount: -4000, currency: "usd", created: day(1) },
      { id: "4", type: "charge", amount: 9999, currency: "eur", created: day(2) },
    ];

    // When
    const points = dailyRevenue(transactions, "usd", 3, NOW);

    // Then
    expect(points.map((p) => p.v)).toEqual([0, 0, 4000]);
    expect(toMajor(4000, "usd")).toBe(40);
    expect(toMajor(4000, "jpy")).toBe(4000);
  });

  test("given a full secret key, when connecting, then it's refused before any request", async () => {
    // Given
    const ctx = fakeContext({});

    // When
    const attempt = stripeConnector.connect!({ key: "sk_live_0123456789abcdef" }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("restricted key");
    expect(ctx.calls).toEqual([]);
    expect(validateFields(stripeConnector.auth!.fields, { key: "sk_live_0123456789abcdef" }).error).toContain("restricted key");
  });

  test("given a key that can't read coupons, when every metric is fetched, then MRR falls back to no discounts", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.stripe.com/v1/balance": { available: [{ currency: "eur" }], pending: [] },
      "https://api.stripe.com/v1/subscriptions": { data: [], has_more: false },
      "https://api.stripe.com/v1/balance_transactions": { data: [{ id: "t", type: "charge", amount: 12345, currency: "eur", created: Math.floor(Date.now() / 1000) }], has_more: false },
    });
    let refusedExpansions = 0;
    const json = ctx.fetch.json.bind(ctx.fetch);
    ctx.fetch.json = (async (url: string, init?: object) => {
      if (url.includes("expand")) {
        refusedExpansions++;
        throw new HttpError(403, url, "");
      }
      return json(url, init as never);
    }) as typeof ctx.fetch.json;

    // When
    const values = await stripeConnector.fetch({ metrics: ["mrr", "revenue30d", "revenue-daily", "subscribers"], params: {}, secret: { key: "rk_test_x" }, public: null }, ctx);

    // Then
    expect(refusedExpansions).toBe(1);
    expect(values.mrr).toEqual({ type: "number", value: 0, unit: "currency", currency: "eur" });
    expect(values.revenue30d).toEqual({ type: "number", value: 123, unit: "currency", currency: "eur" });
    expect(values["revenue-daily"]?.type).toBe("series");
  });

  test("given a revoked key, when fetched, then the owner gets a sentence they can act on", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.stripe.com/v1/balance": () => {
        throw new HttpError(401, "https://api.stripe.com/v1/balance", "");
      },
    });

    // When
    const attempt = stripeConnector.fetch({ metrics: ["mrr"], params: {}, secret: { key: "rk_live_x" }, public: null }, ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });
});
