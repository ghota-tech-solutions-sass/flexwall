import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { parseConfig, type WallConfig } from "@/lib/config";
import { CATALOG, CONNECTOR_IDS, checkFields, type ConnectorSpec } from "@/lib/connectors/catalog";
import { CONNECTORS } from "@/lib/connectors/registry";
import { monthlyValue, revenueOf, toMajor } from "@/lib/connectors/stripe";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { cacheKeysForConnection, resolveWall, valueCacheKey } from "@/lib/metrics";
import { createWall, type Wall } from "@/lib/store/walls";

describe("registry", () => {
  test("every catalog connector is implemented and has samples", () => {
    for (const id of CONNECTOR_IDS) {
      const connector = CONNECTORS[id];
      expect(connector.spec).toBe(CATALOG[id]);
      if ((CATALOG[id] as ConnectorSpec).connection) expect(typeof connector.connect).toBe("function");
      for (const m of CATALOG[id].metrics) expect(connector.sample(m.id)).toBeGreaterThan(0);
    }
  });
});

describe("connector metrics in configs", () => {
  const base = { hero: { kind: "year-progress" } };
  const metric = (m: object) => parseConfig({ ...base, stats: [{ kind: "connector", label: "x", ...m }] });

  test("accepts known source/field with valid params", () => {
    expect(metric({ source: "github", field: "stars", params: { repo: "vercel/next.js" } })).not.toBeNull();
    expect(metric({ source: "stripe", field: "mrr", connection: "abc12345", target: 10000 })).not.toBeNull();
  });

  test("rejects unknown metrics and bad params", () => {
    expect(metric({ source: "stripe", field: "profit" })).toBeNull();
    expect(metric({ source: "nope", field: "x" })).toBeNull();
    expect(metric({ source: "github", field: "stars", params: { repo: "not a repo" } })).toBeNull();
    expect(metric({ source: "github", field: "streak", params: {} })).toBeNull();
  });

  test("connection fields are checked with the same rules the editor uses", () => {
    expect(checkFields(CATALOG.stripe.connection.fields, { key: "sk_live_abcdefghijkl" })).toContain("restricted key");
    expect(checkFields(CATALOG.stripe.connection.fields, { key: "rk_live_abcdefghijkl" })).toBeNull();
    expect(checkFields(CATALOG.http.connection.fields, { url: "http://example.com" })).toContain("https://");
  });
});

describe("crypto", () => {
  test("round-trips and refuses tampered ciphertext", () => {
    const sealed = encryptJson({ key: "rk_live_secret" });
    expect(sealed).not.toContain("rk_live_secret");
    expect(decryptJson<{ key: string }>(sealed).key).toBe("rk_live_secret");
    const parts = sealed.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    expect(() => decryptJson(parts.join("."))).toThrow();
  });

  test("the same secret never seals the same way twice", () => {
    expect(encryptJson("x")).not.toBe(encryptJson("x"));
  });
});

describe("stripe MRR", () => {
  const now = 1_790_000_000;
  const sub = (over: Partial<Stripe.Subscription>, items: { amount: number | null; qty?: number; interval?: "month" | "year" | "week"; count?: number; metered?: boolean }[]) =>
    ({
      status: "active",
      currency: "usd",
      pause_collection: null,
      discounts: [],
      items: {
        data: items.map((i) => ({
          quantity: i.qty ?? 1,
          price: { unit_amount: i.amount, recurring: { interval: i.interval ?? "month", interval_count: i.count ?? 1, usage_type: i.metered ? "metered" : "licensed" } },
        })),
      },
      ...over,
    }) as unknown as Stripe.Subscription;
  const coupon = (c: object, end: number | null = null) => ({ end, source: { coupon: { duration: "forever", percent_off: null, amount_off: null, currency: null, ...c } } });

  test("normalizes intervals and quantities", () => {
    expect(monthlyValue(sub({}, [{ amount: 1000, qty: 3 }]), "usd", now)).toBe(3000);
    expect(monthlyValue(sub({}, [{ amount: 12000, interval: "year" }]), "usd", now)).toBeCloseTo(1000);
    expect(monthlyValue(sub({}, [{ amount: 3000, count: 3 }]), "usd", now)).toBeCloseTo(1000);
  });

  test("skips what isn't recurring revenue in this currency", () => {
    expect(monthlyValue(sub({ status: "trialing" }, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({ currency: "eur" }, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({ pause_collection: { behavior: "void" } } as never, [{ amount: 1000 }]), "usd", now)).toBe(0);
    expect(monthlyValue(sub({}, [{ amount: 1000, metered: true }, { amount: null }]), "usd", now)).toBe(0);
  });

  test("applies running coupons only", () => {
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50 })] } as never, [{ amount: 2000 }]), "usd", now)).toBe(1000);
    expect(monthlyValue(sub({ discounts: [coupon({ amount_off: 500, currency: "usd" })] } as never, [{ amount: 2000 }]), "usd", now)).toBe(1500);
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50 }, now - 1)] } as never, [{ amount: 2000 }]), "usd", now)).toBe(2000);
    expect(monthlyValue(sub({ discounts: [coupon({ percent_off: 50, duration: "once" })] } as never, [{ amount: 2000 }]), "usd", now)).toBe(2000);
  });

  test("revenue nets refunds in the account currency", () => {
    const tx = [
      { type: "charge", amount: 5000, currency: "usd" },
      { type: "refund", amount: -1000, currency: "usd" },
      { type: "payout", amount: -4000, currency: "usd" },
      { type: "charge", amount: 9999, currency: "eur" },
    ] as Stripe.BalanceTransaction[];
    expect(revenueOf(tx, "usd")).toBe(4000);
    expect(toMajor(4000, "usd")).toBe(40);
    expect(toMajor(4000, "jpy")).toBe(4000);
  });
});

describe("resolver", () => {
  const config = (metric: object): WallConfig =>
    parseConfig({ hero: { kind: "connector", label: "MRR", prefix: "$", ...metric }, stats: [] })!;

  async function wallWithHttp(pro: boolean): Promise<Wall> {
    const wall = await createWall(config({ source: "stripe", field: "mrr" }));
    // A connection whose URL the SSRF guard refuses: every fetch fails.
    return {
      ...wall,
      pro,
      connections: {
        conn0001: { id: "conn0001", source: "http", label: "local", public: { host: "127.0.0.1", path: "" }, sealed: encryptJson({ url: "https://127.0.0.1/x" }), createdAt: 1 },
      },
    };
  }

  test("Pro connectors wait for Pro on the phone, but show in the owner's preview", async () => {
    const wall = await wallWithHttp(false);
    const c = config({ source: "http", field: "value", connection: "conn0001" });
    expect((await resolveWall({ config: c, mode: "phone", wall })).hero.label).toContain("needs Pro");
    expect((await resolveWall({ config: c, mode: "owner", wall })).hero.label).toBe("Your API unreachable");
  });

  test("missing connections and anonymous previews ask to connect", async () => {
    const wall = await wallWithHttp(true);
    expect((await resolveWall({ config: config({ source: "stripe", field: "mrr", connection: "conn0001" }), mode: "phone", wall })).hero.label).toBe("connect Stripe");
    expect((await resolveWall({ config: config({ source: "http", field: "value", connection: "conn0001" }), mode: "anonymous", wall })).hero.label).toBe("connect Your API");
  });

  test("a failing refresh serves the last known value instead of a dash", async () => {
    const wall = await wallWithHttp(true);
    const key = valueCacheKey("http", "conn0001", "value");
    wall.valueCache = { [key]: { at: Date.now() - 24 * 3600_000, values: { value: 1234 } } };
    const r = await resolveWall({ config: config({ source: "http", field: "value", connection: "conn0001" }), mode: "phone", wall });
    expect(r.hero.value).toBe("$1,234");
    expect(cacheKeysForConnection(wall, "http", "conn0001")).toEqual([key]);
  });

  test("goals on connector metrics draw a bar", async () => {
    const r = await resolveWall({ config: config({ source: "stripe", field: "mrr", target: 10000 }), mode: "sample" });
    expect(r.hero.value).toBe("$4,820");
    expect(r.hero.of).toBe("/ $10k");
    expect(r.hero.progress).toBeCloseTo(0.482);
  });
});
