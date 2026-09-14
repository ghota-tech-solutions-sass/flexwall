import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { Subprocess } from "bun";
import Stripe from "stripe";

/**
 * Boots the REAL standalone server (the artifact that ships to Cloud Run) in
 * memory-store mode and drives it over HTTP: save a wallpaper, fetch it the
 * way the Shortcut does, pay through a signed webhook, see Pro apply.
 * Prerequisite: `bun run build` (use `bun run check`).
 */
const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const WEBHOOK_SECRET = "whsec_functional_test";

let server: Subprocess<"ignore", "pipe", "pipe"> | null = null;
let logs = "";

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
      FLEXWALL_SECRET: "functional-test-secret",
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      NEXT_PUBLIC_APP_URL: BASE,
      GOOGLE_PROJECT_ID: "",
      EMAIL_IMPERSONATE: "",
    },
  });
  for (const stream of [server.stdout, server.stderr]) {
    (async () => {
      const reader = stream.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        logs += dec.decode(value);
      }
    })();
  }
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + "/robots.txt")).ok) return;
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error("server did not start:\n" + logs);
});

afterAll(() => server?.kill());

type View = { id: string; pro: boolean; public: boolean; imagePath: string; editPath: string };
const keyOf = (v: View) => new URL(v.editPath, BASE).searchParams.get("k")!;

async function create(config: unknown): Promise<View> {
  const res = await fetch(BASE + "/api/walls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }) });
  expect(res.status).toBe(201);
  return res.json();
}

function isPng(buf: ArrayBuffer) {
  return [...new Uint8Array(buf.slice(0, 4))].join() === "137,80,78,71";
}

describe("pages", () => {
  for (const path of ["/", "/new", "/setup", "/wall", "/legal", "/robots.txt", "/sitemap.xml"]) {
    test(`GET ${path}`, async () => expect((await fetch(BASE + path)).status).toBe(200));
  }
  test("edit pages are not indexable", async () => {
    const html = await (await fetch(BASE + "/edit/abcdefghij")).text();
    expect(html).toContain('name="robots" content="noindex, nofollow"');
  });
});

describe("wallpaper lifecycle", () => {
  test("save → Shortcut fetch → edit → pay → Pro image", async () => {
    const view = await create({ theme: "terminal", hero: { kind: "goal", label: "MRR", current: 1200, target: 5000, prefix: "$" }, stats: [{ kind: "year-progress" }] });
    expect(view.pro).toBe(false);

    // The Shortcut's fetch: full resolution, never cached. Fonts must be in the build for this.
    const img = await fetch(BASE + view.imagePath);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("no-store");
    const buf = await img.arrayBuffer();
    expect(isPng(buf)).toBe(true);
    expect(new DataView(buf).getUint32(16)).toBe(1206);

    // Wrong keys look exactly like missing walls.
    expect((await fetch(`${BASE}/i/${view.id}/nope`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/walls/${view.id}`, { headers: { "x-edit-key": "nope" } })).status).toBe(404);

    const key = keyOf(view);
    const patched = await fetch(`${BASE}/api/walls/${view.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-edit-key": key },
      body: JSON.stringify({ public: true, config: { theme: "sunset", hero: { kind: "year-progress" } } }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { config: { theme: string } }).config.theme).toBe("sunset");
    expect((await fetch(`${BASE}/p/${view.id}`)).status).toBe(404); // public, but not Pro

    const payload = JSON.stringify({
      id: "evt_functional_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_functional", object: "checkout.session", payment_status: "paid", metadata: { wallId: view.id } } },
    });
    const header = await new Stripe("sk_test_dummy").webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET });
    for (let i = 0; i < 2; i++) {
      const hook = await fetch(BASE + "/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header }, body: payload });
      expect(hook.status).toBe(200);
    }
    expect(logs).toContain(`wall ${view.id} unlocked Pro`);
    expect(logs.match(/unlocked Pro/g)?.length).toBe(1);

    const after = (await (await fetch(`${BASE}/api/walls/${view.id}`, { headers: { "x-edit-key": key } })).json()) as View;
    expect(after.pro).toBe(true);
    expect((await fetch(`${BASE}/p/${view.id}`)).status).toBe(200);
    expect(await (await fetch(BASE + "/wall")).text()).toContain(`/p/${view.id}`);
  }, 30_000);

  test("rotating the image link kills the old one", async () => {
    const view = await create({ hero: { kind: "year-progress" } });
    const res = await fetch(`${BASE}/api/walls/${view.id}/rotate`, { method: "POST", headers: { "x-edit-key": keyOf(view) } });
    const next = (await res.json()) as View;
    expect(next.imagePath).not.toBe(view.imagePath);
    expect((await fetch(BASE + view.imagePath)).status).toBe(404);
    expect((await fetch(BASE + next.imagePath)).status).toBe(200);
  }, 20_000);

  test("preview is capped and rejects bad configs", async () => {
    const c = Buffer.from(JSON.stringify({ hero: { kind: "year-progress" } })).toString("base64url");
    const res = await fetch(`${BASE}/api/preview?w=5000&c=${c}`);
    expect(res.status).toBe(200);
    expect(new DataView(await res.arrayBuffer()).getUint32(16)).toBe(603);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await fetch(`${BASE}/api/preview?c=garbage`)).status).toBe(422);
    // Landing samples are the one image anyone may cache.
    const sample = await fetch(`${BASE}/api/preview?sample=1&c=${c}`);
    expect(sample.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  test("webhook refuses unsigned calls; checkout needs the edit key", async () => {
    expect((await fetch(BASE + "/api/webhooks/stripe", { method: "POST", body: "{}" })).status).toBe(400);
    const view = await create({ hero: { kind: "year-progress" } });
    const res = await fetch(BASE + "/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: view.id }) });
    expect(res.status).toBe(404);
  });
});
