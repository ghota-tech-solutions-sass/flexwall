import { beforeEach, describe, expect, test } from "bun:test";
import { BlockedRequestError } from "@flexwall/sdk";
import { guardedFetch, isPrivateAddress, validateTarget } from "@/infrastructure/net/guarded-fetch";
import { db, resetMemoryDb } from "@/infrastructure/persistence/db";
import { DbCredits, DbEventLog, DbHandles, DbReferrals, DbSnapshots, DbUsers, DbValueCache, DbWalls } from "@/infrastructure/persistence/repositories";
import { AesSecretBox } from "@/infrastructure/security/secret-box";
import { HmacTokenService } from "@/infrastructure/security/tokens";
import { aReferral, aTile, aUser, aWall } from "../builders";
import { FixedClock } from "../fakes";

/**
 * The real adapters, against the memory store (or the Firestore emulator when
 * FIRESTORE_EMULATOR_HOST and GOOGLE_PROJECT_ID are set: `task test:firestore`).
 */

beforeEach(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) resetMemoryDb();
});

describe("Repositories", () => {
  test("given a balance, when the same connection's day is spent twice, released, and credits are added once per entry, then the ledger stays consistent", async () => {
    // Given
    const credits = new DbCredits(db());
    const userId = `c-${crypto.randomUUID()}`;
    expect(await credits.adjust({ userId, entryId: "evt_1", amount: 2, reason: "purchase", detail: "starter" })).toBe(true);
    expect(await credits.adjust({ userId, entryId: "evt_1", amount: 2, reason: "purchase", detail: "starter" })).toBe(false);

    // When
    const spends = [
      await credits.spend({ userId, key: "conn-1", day: "2026-09-16", amount: 1, detail: "@ada" }),
      await credits.spend({ userId, key: "conn-1", day: "2026-09-16", amount: 1, detail: "@ada" }),
      await credits.spend({ userId, key: "conn-2", day: "2026-09-16", amount: 1, detail: "@bob" }),
      await credits.spend({ userId, key: "conn-3", day: "2026-09-16", amount: 1, detail: "@cy" }),
    ];
    await credits.release({ userId, key: "conn-2", day: "2026-09-16" });

    // Then
    expect(spends).toEqual(["charged", "already_paid", "charged", "insufficient"]);
    expect(await credits.balance(userId)).toBe(1);
    expect((await credits.history(userId, 10)).map((e) => e.reason).sort()).toEqual(["purchase", "spend"]);
  });

  test("given a saved user, when looked up by email or Stripe customer, then the same user comes back", async () => {
    // Given
    const users = new DbUsers(db());
    await users.save(aUser().withId(`u-${crypto.randomUUID()}`).withEmail("ada@example.com").withStripeCustomer("cus_ada").build());

    // When
    const byEmail = await users.byEmail("ada@example.com");
    const byCustomer = await users.byStripeCustomer("cus_ada");

    // Then
    expect(byEmail?.id).toBe(byCustomer?.id);
  });

  test("given referrals from two referrers, when read by invitee and by referrer, then each finds its own", async () => {
    // Given
    const referrals = new DbReferrals(db());
    const referrer = `r-${crypto.randomUUID()}`;
    await referrals.save(aReferral().from(referrer).to(`a-${referrer}`).build());
    await referrals.save(aReferral().from(referrer).to(`b-${referrer}`).converted().build());
    await referrals.save(aReferral().from(`other-${referrer}`).to(`c-${referrer}`).build());

    // When
    const byReferee = await referrals.byReferee(`b-${referrer}`);
    const byReferrer = await referrals.byReferrer(referrer);

    // Then
    expect(byReferee?.status).toBe("converted");
    expect(byReferrer.map((r) => r.refereeId).sort()).toEqual([`a-${referrer}`, `b-${referrer}`]);
  });

  test("given a claimed handle, when someone else claims it, then the registry refuses atomically", async () => {
    // Given
    const handles = new DbHandles(db());
    const handle = `h${crypto.randomUUID().slice(0, 8)}` as never;

    // When
    const [first, second] = await Promise.all([handles.claim(handle, "u1"), handles.claim(handle, "u2")]);

    // Then
    expect([first, second].sort()).toEqual([false, true]);
  });

  test("given walls, when fetched by handle and by listing, then only listed walls are listed", async () => {
    // Given
    const walls = new DbWalls(db());
    const owner = aUser().withId("owner-x").withHandle(`x${crypto.randomUUID().slice(0, 6)}`).build();
    await walls.save(aWall().withId(`w-${owner.handle}`).ownedBy(owner).listed().with(aTile().withId("t").note()).build());

    // When
    const found = await walls.byHandle(owner.handle!);
    const listed = await walls.listed(100);

    // Then
    expect(found?.tiles[0].id).toBe("t");
    expect(listed.some((w) => w.handle === owner.handle)).toBe(true);
  });

  test("given cache keys with slashes, when stored and read, then they round-trip", async () => {
    // Given
    const cache = new DbValueCache(db());
    const key = `github|-|repo:vercel/next.js|${crypto.randomUUID()}`;

    // When
    await cache.set(key, { at: 1, values: { stars: { type: "number", value: 140000 } } });

    // Then
    expect((await cache.get(key))?.values.stars).toEqual({ type: "number", value: 140000 });
    expect(await cache.get(key + "x")).toBeNull();
  });

  test("given several readings on one day, when the range is read, then the day keeps the last one", async () => {
    // Given
    const snapshots = new DbSnapshots(db());
    const series = `stripe|c1|mrr|${crypto.randomUUID()}`;

    // When
    await snapshots.record(series, "2026-09-13", 10);
    await snapshots.record(series, "2026-09-14", 11);
    await snapshots.record(series, "2026-09-14", 12);

    // Then
    expect(await snapshots.range(series, "2026-09-01", "2026-09-14")).toEqual([
      { t: "2026-09-13", v: 10 },
      { t: "2026-09-14", v: 12 },
    ]);
  });

  test("given an event id, when seen twice, then only the first time counts", async () => {
    // Given
    const events = new DbEventLog(db());
    const id = `evt_${crypto.randomUUID()}`;

    // When
    const first = await events.firstTime(id);
    const second = await events.firstTime(id);

    // Then
    expect([first, second]).toEqual([true, false]);
  });
});

describe("HmacTokenService", () => {
  test("given a sign-in token, when used as a session, then it's refused", () => {
    // Given
    const tokens = new HmacTokenService("s3cret", true, new FixedClock());
    const magic = tokens.magic("ada@example.com");

    // When
    const asSession = tokens.verifySession(magic);

    // Then
    expect(asSession).toBeNull();
    expect(tokens.verifyMagic(magic)).toBe("ada@example.com");
  });

  test("given a sign-in token, when 21 minutes pass, then it has expired", () => {
    // Given
    const clock = new FixedClock();
    const tokens = new HmacTokenService("s3cret", true, clock);
    const magic = tokens.magic("ada@example.com");

    // When
    clock.advance(21 * 60 * 1000);

    // Then
    expect(tokens.verifyMagic(magic)).toBeNull();
  });

  test("given a token signed with another secret, when verified, then it's refused", () => {
    // Given
    const clock = new FixedClock();
    const forged = new HmacTokenService("other", true, clock).session("u1");

    // When
    const result = new HmacTokenService("s3cret", true, clock).verifySession(forged);

    // Then
    expect(result).toBeNull();
  });

  test("given production without a secret, when the service starts, then it refuses to", () => {
    // Given / When / Then
    expect(() => new HmacTokenService(undefined, true, new FixedClock())).toThrow("FLEXWALL_SECRET");
  });
});

describe("AesSecretBox", () => {
  test("given a sealed secret, when a byte is changed, then opening fails instead of returning garbage", () => {
    // Given
    const box = new AesSecretBox(Buffer.alloc(32, 7).toString("base64"), true);
    const sealed = box.seal({ key: "rk_live_secret" });
    const parts = sealed.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);

    // When
    const tampered = () => box.open(parts.join("."));

    // Then
    expect(sealed).not.toContain("rk_live_secret");
    expect(box.open(sealed)).toEqual({ key: "rk_live_secret" });
    expect(tampered).toThrow();
  });
});

describe("Guarded fetch", () => {
  test("given private, metadata and mapped addresses, when checked, then all are private", () => {
    // Given
    const addresses = ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "nope"];

    // When
    const verdicts = addresses.map(isPrivateAddress);

    // Then
    expect(verdicts.every(Boolean)).toBe(true);
    expect(["1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"].some(isPrivateAddress)).toBe(false);
  });

  test("given URLs aimed at internal targets, when validated, then they're refused before any socket", () => {
    // Given
    const urls = ["http://example.com", "https://169.254.169.254/computeMetadata/v1", "https://[::1]/", "https://metadata.google.internal/", "https://user:pass@example.com/"];

    // When
    const refused = urls.map((u) => {
      try {
        validateTarget(u);
        return false;
      } catch (e) {
        return e instanceof BlockedRequestError;
      }
    });

    // Then
    expect(refused).toEqual([true, true, true, true, true]);
  });

  test("given a public name that resolves to 127.0.0.1, when fetched, then the connection is refused at lookup, never opened", async () => {
    // Given
    const url = "https://localtest.me/";

    // When
    const error = await guardedFetch.text(url, { timeoutMs: 3000 }).catch((e: Error) => e);

    // Then
    expect(String(error)).toMatch(/private address|ENOTFOUND|EAI_AGAIN|getaddrinfo/);
    expect(String(error)).not.toMatch(/ECONNREFUSED/);
  });
});
