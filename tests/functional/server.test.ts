import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import type { Subprocess } from "bun";

/**
 * Functional suite: boots the REAL standalone server (the artifact that ships
 * to Cloud Run) in demo mode and exercises it over HTTP.
 * Prerequisite: a production build (`bun run build`) — use `bun run check`.
 *
 * Known standalone quirk: each route bundle gets its own copy of the in-memory
 * store, so a webhook credit is asserted through the server logs, not through
 * /api/board. In production Firestore is the single shared store.
 */
const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const SESSION_SECRET = "functional-test-secret";
const WEBHOOK_SECRET = "whsec_functional_test";

let server: Subprocess<"ignore", "pipe", "pipe"> | null = null;
let logs = "";

async function up(): Promise<boolean> {
  try {
    return (await fetch(BASE + "/robots.txt")).ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!existsSync(".next/standalone/server.js")) {
    throw new Error("No standalone build. Run: bun run check (or bun run build first).");
  }
  Bun.spawnSync(["cp", "-r", "public", ".next/standalone/"]);
  Bun.spawnSync(["cp", "-r", ".next/static", ".next/standalone/.next/"]);
  server = Bun.spawn(["bun", "server.js"], {
    cwd: ".next/standalone",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      AUTH_SESSION_SECRET: SESSION_SECRET,
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      NEXT_PUBLIC_APP_URL: BASE,
      GOOGLE_PROJECT_ID: "",
      EMAIL_IMPERSONATE: "",
    },
  });
  const reader = server.stdout.getReader();
  (async () => {
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      logs += dec.decode(value);
    }
  })();
  for (let i = 0; i < 60 && !(await up()); i++) await Bun.sleep(250);
  if (!(await up())) throw new Error("server did not come up");
}, 30_000);

afterAll(() => {
  server?.kill();
});

describe("pages", () => {
  const routes = ["/", "/board", "/how-it-works", "/me", "/about", "/share/hedge_bae", "/share/unknown_seat", "/robots.txt", "/sitemap.xml", "/og.png", "/icon.svg"];
  for (const r of routes) {
    test(`GET ${r} → 200`, async () => {
      expect((await fetch(BASE + r)).status).toBe(200);
    });
  }
  test("dynamic OG image renders a PNG", async () => {
    const res = await fetch(BASE + "/share/hedge_bae/opengraph-image");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
  });
  test("security headers are set", async () => {
    const res = await fetch(BASE + "/");
    expect(res.headers.get("strict-transport-security")).toContain("max-age");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
  test("no payerEmail ever leaks in HTML or API", async () => {
    expect(await (await fetch(BASE + "/")).text()).not.toContain("payerEmail");
    const board = await (await fetch(BASE + "/api/board")).json();
    for (const e of board.entries) expect("payerEmail" in e).toBe(false);
  });
});

describe("checkout validation", () => {
  const post = (body: unknown) =>
    fetch(BASE + "/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  test("garbage body → 400", async () => {
    const res = await fetch(BASE + "/api/checkout", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });
  test("negative amount → 400", async () => {
    expect((await post({ handle: "x", amount: -5 })).status).toBe(400);
  });
  test("new name below floor → 422 with floor", async () => {
    const res = await post({ handle: "brand_new_name", amount: 5 });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("below_minimum");
  });
  test("top-up has no floor (reaches Stripe with dummy key → 502)", async () => {
    expect((await post({ handle: "hedge_bae", amount: 5 })).status).toBe(502);
  });
  test("absurd amount → 422 ceiling", async () => {
    expect((await post({ handle: "whale", amount: 999_999_999 })).status).toBe(422);
  });
});

describe("sessions and magic links", () => {
  test("magic link sets the session cookie and /api/me works with it", async () => {
    process.env.AUTH_SESSION_SECRET = SESSION_SECRET;
    const { createMagicToken } = await import("../../src/lib/session");
    const token = createMagicToken("hedge_bae", 60_000);
    const res = await fetch(`${BASE}/me/link?token=${token}`, { redirect: "manual" });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe(`${BASE}/me`);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("fw_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
    const me = await fetch(BASE + "/api/me", { headers: { cookie: cookie.split(";")[0] } });
    const data = await me.json();
    expect(data.found).toBe(true);
    expect(data.seat.slug).toBe("hedge_bae");
  });
  test("expired magic link bounces to /me?link=expired", async () => {
    process.env.AUTH_SESSION_SECRET = SESSION_SECRET;
    const { createMagicToken } = await import("../../src/lib/session");
    const res = await fetch(`${BASE}/me/link?token=${createMagicToken("x", -1)}`, { redirect: "manual" });
    expect(res.headers.get("location")).toBe(`${BASE}/me?link=expired`);
  });
  test("no cookie → 401; email path without mail config → 503", async () => {
    expect((await fetch(BASE + "/api/me")).status).toBe(401);
    const res = await fetch(BASE + "/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@example.com" }),
    });
    expect(res.status).toBe(503);
  });
});

describe("stripe webhook", () => {
  function signed(payload: string): string {
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
    return `t=${t},v1=${sig}`;
  }
  const event = (id: string) =>
    JSON.stringify({
      id,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_ft",
          object: "checkout.session",
          payment_status: "paid",
          amount_subtotal: 12_300,
          amount_total: 12_300,
          metadata: { slug: "func_test", name: "Func Test" },
          customer_details: { email: "func@test.dev" },
        },
      },
    });
  const post = (body: string, sig?: string) =>
    fetch(BASE + "/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) },
      body,
    });

  test("missing signature → 400", async () => {
    expect((await post(event("evt_ft_0"))).status).toBe(400);
  });
  test("bad signature → 400", async () => {
    expect((await post(event("evt_ft_0"), "t=1,v1=bad")).status).toBe(400);
  });
  test("valid signature credits; replay of the same event is ignored", async () => {
    const body = event("evt_ft_1");
    expect((await post(body, signed(body))).status).toBe(200);
    expect((await post(body, signed(body))).status).toBe(200);
    await Bun.sleep(300);
    expect(logs).toContain("credited func_test (Func Test) +$123");
    expect(logs).toContain("duplicate webhook evt_ft_1 ignored");
  });
});

describe("seen beacon", () => {
  test("valid slug counts, invalid rejected", async () => {
    const post = (slug: string) =>
      fetch(BASE + "/api/seen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
    expect((await post("hedge_bae")).status).toBe(200);
    expect((await post("../etc")).status).toBe(422);
  });
});
