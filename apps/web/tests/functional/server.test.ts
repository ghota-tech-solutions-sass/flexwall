import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { HmacTokenService } from "@/infrastructure/security/tokens";

/**
 * The real production server (Next standalone output), in memory-store mode,
 * driven over HTTP the way a person would: sign in, claim a handle, build and
 * publish a wall, share it, put it on a lock screen.
 * Needs a build first: `bun run check` does both.
 */

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const SECRET = "functional-secret";
const SERVER = join(import.meta.dir, "../../.next/standalone/apps/web/server.js");

let server: Subprocess<"ignore", "pipe", "pipe"> | null = null;
let logs = "";
let cookie = "";

async function http(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers: Record<string, string> = { origin: BASE, ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  return fetch(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, redirect: "manual" });
}

beforeAll(async () => {
  if (!existsSync(SERVER)) throw new Error("No standalone build. Run: bun run check (or bun run build first).");
  const standalone = join(import.meta.dir, "../../.next/standalone/apps/web");
  Bun.spawnSync(["cp", "-r", join(import.meta.dir, "../../public"), standalone]);
  Bun.spawnSync(["mkdir", "-p", join(standalone, ".next")]);
  Bun.spawnSync(["cp", "-r", join(import.meta.dir, "../../.next/static"), join(standalone, ".next/")]);
  server = Bun.spawn(["bun", "server.js"], {
    cwd: standalone,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: BASE,
      FLEXWALL_SECRET: SECRET,
      FLEXWALL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      GOOGLE_PROJECT_ID: "",
      EMAIL_IMPERSONATE: "",
      STRIPE_SECRET_KEY: "",
    },
  });
  for (const stream of [server.stdout, server.stderr]) {
    (async () => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        logs += decoder.decode(value);
      }
    })();
  }
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE + "/robots.txt")).ok) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(250);
  }
  throw new Error("server did not start:\n" + logs);
});

afterAll(() => server?.kill());

describe("Public pages", () => {
  for (const path of ["/", "/explore", "/pricing", "/login", "/legal", "/demo/card.png", "/demo/lockscreen.png", "/robots.txt", "/sitemap.xml"]) {
    test(`given a visitor, when they open ${path}, then it answers`, async () => {
      // Given / When
      const res = await http(path);

      // Then
      expect(res.status).toBe(200);
    });
  }

  test("given a handle nobody claimed, when its wall is opened, then it's a 404", async () => {
    // Given / When
    const res = await http("/@nobody_here");

    // Then
    expect(res.status).toBe(404);
  });
});

describe("From sign-in to a shared wall", () => {
  test("given a sign-in link, when it's opened, then a session starts and onboarding follows", async () => {
    // Given
    const link = await http("/api/auth/request", { method: "POST", json: { email: "ada@example.com" } });
    expect(link.status).toBe(200);
    const token = new HmacTokenService(SECRET, true, { now: () => Date.now() }).magic("ada@example.com");

    // When
    const res = await http(`/api/auth/verify?token=${encodeURIComponent(token)}&tz=Europe/Paris`);

    // Then
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/onboarding`);
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie).toStartWith("fw_session=");
  });

  test("given a session, when a handle is claimed, then the editor opens on a starter wall", async () => {
    // Given / When
    const claim = await http("/api/me/handle", { method: "POST", json: { handle: "Ada Builds" } });
    const editor = await http("/edit");

    // Then
    expect(claim.status).toBe(200);
    expect(editor.status).toBe(200);
  });

  test("given a request from another site, when it tries to change the wall, then it's refused", async () => {
    // Given / When
    const res = await http("/api/wall", { method: "PUT", json: {}, headers: { origin: "https://evil.example" } });

    // Then
    expect(res.status).toBe(403);
  });

  test("given the starter wall, when the owner publishes it, then strangers see its public tiles and its share card", async () => {
    // Given
    const { wall } = (await (await http("/api/wall")).json()) as { wall: { tiles: unknown[]; lockscreen: unknown } };

    // When
    const saved = await http("/api/wall", {
      method: "PUT",
      json: { title: "Ada Builds", bio: "Shipping in public", theme: "night", tiles: wall.tiles, lockscreen: wall.lockscreen, published: true, listed: true },
    });
    cookie = "";
    const page = await http("/@ada-builds");
    const loose = await http("/@Ada_Builds");
    const card = await http("/u/ada-builds/opengraph-image");

    // Then
    expect(saved.status).toBe(200);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Ada Builds");
    expect(loose.status).toBe(308);
    expect(loose.headers.get("location")).toEndWith("/@ada-builds");
    expect(card.headers.get("content-type")).toContain("image/png");
  });

  test("given a free published wall, when its footer invite is followed, then the browser remembers who invited it", async () => {
    // Given
    cookie = "";
    const page = await http("/@ada-builds");

    // When
    const invite = await http("/r/ada-builds");

    // Then
    expect(await page.text()).toContain('href="/r/ada-builds"');
    expect(invite.status).toBe(307);
    expect(invite.headers.get("set-cookie")).toContain("fw_ref=ada-builds");
    expect(invite.headers.get("set-cookie")?.toLowerCase()).toContain("httponly");
  });

  test("given a published wall, when its lock screen link is fetched without any cookie, then a fresh PNG comes back", async () => {
    // Given
    const token = new HmacTokenService(SECRET, true, { now: () => Date.now() }).magic("ada@example.com");
    const signIn = await http(`/api/auth/verify?token=${encodeURIComponent(token)}`);
    cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0];
    const { lockscreenPath } = (await (await http("/api/wall")).json()) as { lockscreenPath: string };
    cookie = "";

    // When
    const image = await http(lockscreenPath);
    const guessed = await http(lockscreenPath.replace(/\/[^/]+$/, "/guess"));

    // Then
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toContain("no-store");
    expect(new DataView(await image.arrayBuffer()).getUint32(16)).toBe(1206);
    expect(guessed.status).toBe(404);
  }, 20_000);

  test("given a signed-in owner, when an endpoint on a private address is connected, then it's refused before any request", async () => {
    // Given
    const token = new HmacTokenService(SECRET, true, { now: () => Date.now() }).magic("ada@example.com");
    cookie = ((await http(`/api/auth/verify?token=${encodeURIComponent(token)}`)).headers.get("set-cookie") ?? "").split(";")[0];

    // When
    const res = await http("/api/connections", { method: "POST", json: { connector: "http", values: { url: "https://169.254.169.254/computeMetadata/v1/" } } });

    // Then
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("private");
  });

  test("given a signed-in owner, when a connection they don't have is renamed, then it's not found", async () => {
    // Given
    const token = new HmacTokenService(SECRET, true, { now: () => Date.now() }).magic("ada@example.com");
    cookie = ((await http(`/api/auth/verify?token=${encodeURIComponent(token)}`)).headers.get("set-cookie") ?? "").split(";")[0];

    // When
    const res = await http("/api/connections/nope", { method: "PATCH", json: { nickname: "Main shop" } });

    // Then
    expect(res.status).toBe(404);
  });

  test("given an unsigned Stripe webhook, when it arrives, then it's rejected", async () => {
    // Given / When
    const res = await http("/api/webhooks/stripe", { method: "POST", body: "{}" });

    // Then
    expect(res.status).toBe(400);
  });
});
