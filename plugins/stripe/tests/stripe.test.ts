import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import stripe, { dailyRevenue, monthlyValue, stripeConnector, toMajor, type Subscription } from "../src/index";

const now = 1_790_000_000;
const sub = (over: Partial<Subscription>, items: { amount: number | null; qty?: number; interval?: string; count?: number; metered?: boolean }[]): Subscription => ({
  id: "sub_1",
  status: "active",
  currency: "usd",
  pause_collection: null,
  discounts: [],
  items: { data: items.map((i) => ({ quantity: i.qty ?? 1, price: { unit_amount: i.amount, recurring: { interval: i.interval ?? "month", interval_count: i.count ?? 1, usage_type: i.metered ? "metered" : "licensed" } } })) },
  ...over,
});
const coupon = (c: object, end: number | null = null) => ({ end, source: { coupon: { duration: "forever" as const, percent_off: null, amount_off: null, currency: null, ...c } } });

describe("stripe plugin", () => {
  test("passes the plugin checks", () => expect(checkPlugins([stripe])).toEqual([]));

  test("MRR normalizes intervals and quantities", () => {
    expect(monthlyValue(sub({}, [{ amount: 1000, qty: 3 }]), "usd", now)).toBe(3000);
    expect(monthlyValue(sub({}, [{ amount: 12000, interval: "year" }]), "usd", now)).toBeCloseTo(1000);
    expect(monthlyValue(sub({}, [{ amount: 3000, count: 3 }]), "usd", now)).toBeCloseTo(1000);
  });

  test("MRR skips what isn't recurring revenue in this currency", () => {
    expect(monthlyValue(sub({ status: "trialing" }, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({ currency: "eur" }, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({ pause_collection: {} }, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({}, [{ amount: 1000, metered: true }, { amount: null }]), "usd", now)).toBe(0);
  });

  test("MRR applies running coupons only", () => {
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50 })] }, [{ amount: 2000 }]), "usd", now)).toBe(1000);
    expect(monthlyValue(sub({ discounts: [coupon({ amount_off: 500, currency: "usd" })] }, [{ amount: 2000 }]), "usd", now)).toBe(1500);
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50 }, now - 1)] }, [{ amount: 2000 }]), "usd", now)).toBe(2000);
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50, duration: "once" })] }, [{ amount: 2000 }]), "usd", now)).toBe(2000);
  });

  test("daily revenue nets refunds, fills empty days, ignores payouts and other currencies", () => {
    const day = (d: number) => now - d * 86_400;
    const points = dailyRevenue(
      [
        { id: "1", type: "charge", amount: 5000, currency: "usd", created: day(0) },
        { id: "2", type: "refund", amount: -1000, currency: "usd", created: day(0) },
        { id: "3", type: "payout", amount: -4000, currency: "usd", created: day(1) },
        { id: "4", type: "charge", amount: 9999, currency: "eur", created: day(2) },
      ],
      "usd",
      3,
      now
    );
    expect(points.map((p) => p.v)).toEqual([0, 0, 4000]);
    expect(toMajor(4000, "usd")).toBe(40);
    expect(toMajor(4000, "jpy")).toBe(4000);
  });

  test("refuses full secret keys before any request", async () => {
    const ctx = fakeContext({});
    await expect(stripeConnector.connect!({ key: "sk_live_0123456789abcdef" }, ctx)).rejects.toThrow("restricted key");
    expect(ctx.calls).toEqual([]);
    expect(validateFields(stripeConnector.auth!.fields, { key: "sk_live_0123456789abcdef" }).error).toContain("restricted key");
  });

  test("walks pages, falls back without coupons on a 403, and answers every metric", async () => {
    let expanded = 0;
    const ctx = fakeContext({
      "https://api.stripe.com/v1/balance": { available: [{ currency: "eur" }], pending: [] },
      "https://api.stripe.com/v1/subscriptions": { data: [], has_more: false },
      "https://api.stripe.com/v1/balance_transactions": { data: [{ id: "t", type: "charge", amount: 12345, currency: "eur", created: Math.floor(Date.now() / 1000) }], has_more: false },
    });
    // Coupons forbidden on the expanded call only.
    const json = ctx.fetch.json.bind(ctx.fetch);
    ctx.fetch.json = (async (url: string, init?: object) => {
      if (url.includes("expand")) {
        expanded++;
        throw new HttpError(403, url, "");
      }
      return json(url, init as never);
    }) as typeof ctx.fetch.json;
    const out = await stripeConnector.fetch({ metrics: ["mrr", "revenue30d", "revenue-daily", "subscribers"], params: {}, secret: { key: "rk_test_x" }, public: null }, ctx);
    expect(expanded).toBe(1);
    expect(out.mrr).toEqual({ type: "number", value: 0, unit: "currency", currency: "eur" });
    expect(out.revenue30d).toEqual({ type: "number", value: 123, unit: "currency", currency: "eur" });
    expect(out["revenue-daily"]?.type).toBe("series");
  });

  test("a revoked key reads as a sentence the owner can act on", async () => {
    const ctx = fakeContext({ "https://api.stripe.com/v1/balance": () => { throw new HttpError(401, "https://api.stripe.com/v1/balance", ""); } });
    await expect(stripeConnector.fetch({ metrics: ["mrr"], params: {}, secret: { key: "rk_live_x" }, public: null }, ctx)).rejects.toBeInstanceOf(ConnectorError);
  });
});
