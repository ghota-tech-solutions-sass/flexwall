import { beforeEach, describe, expect, test } from "bun:test";
import { creditEntry, eventsForSlug, findEntryByEmail, listEntries, recordSeatView, resetMemoryStore } from "../../src/lib/store/entries";

// Memory mode: no GOOGLE_PROJECT_ID in the test env.
beforeEach(() => resetMemoryStore());

describe("memory store", () => {
  test("public entries never carry payerEmail", async () => {
    await creditEntry("bob", "Bob", 500, "bob@x.com", "evt_a");
    for (const e of await listEntries()) expect("payerEmail" in e).toBe(false);
  });
  test("credit is idempotent by event id", async () => {
    const first = await creditEntry("bob", "Bob", 500, "bob@x.com", "evt_1");
    const replay = await creditEntry("bob", "Bob", 500, "bob@x.com", "evt_1");
    const topup = await creditEntry("bob", "Bob", 200, "bob@x.com", "evt_2");
    expect(first?.type).toBe("entry");
    expect(replay).toBeNull();
    expect(topup?.type).toBe("topup");
    const bob = (await listEntries()).find((e) => e.slug === "bob");
    expect(bob?.amountUSD).toBe(700);
  });
  test("email lookup is exact and case-insensitive", async () => {
    await creditEntry("bob", "Bob", 500, "Bob@X.com", "evt_b");
    expect((await findEntryByEmail("bob@x.com"))?.slug).toBe("bob");
    expect(await findEntryByEmail("nobody@x.com")).toBeNull();
    expect(await findEntryByEmail("not-an-email")).toBeNull();
  });
  test("events journal per slug, newest first", async () => {
    await creditEntry("bob", "Bob", 500, undefined, "evt_c");
    await creditEntry("bob", "Bob", 100, undefined, "evt_d");
    await creditEntry("alice", "Alice", 900, undefined, "evt_e");
    const evs = await eventsForSlug("bob");
    expect(evs.map((e) => e.id)).toEqual(["evt_d", "evt_c"]);
  });
  test("seat views increment", async () => {
    await creditEntry("bob", "Bob", 500, undefined, "evt_f");
    await recordSeatView("bob");
    await recordSeatView("bob");
    await recordSeatView("ghost"); // inconnu : silencieux
    const bob = (await listEntries()).find((e) => e.slug === "bob");
    expect(bob?.views).toBe(2);
  });
});
