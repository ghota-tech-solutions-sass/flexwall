import { describe, expect, test } from "bun:test";
import { money, number } from "@flexwall/sdk";
import { freshnessSeconds, RENDER_DEADLINE_MS, ResolveWall, seriesKey } from "@/application/use-cases/resolve-wall";
import { aConnection, aTile, aUser } from "../builders";
import { FakeRuntime, FixedClock, InMemoryConnections, InMemorySnapshots, InMemoryValueCache, TransparentSecretBox } from "../fakes";
import { SOCIAL_TOKEN_EXPIRY, testCatalog } from "../fakes/test-plugin";

function setup() {
  const { catalog, upstream } = testCatalog();
  const connections = new InMemoryConnections();
  const cache = new InMemoryValueCache();
  const snapshots = new InMemorySnapshots();
  const clock = new FixedClock();
  const resolve = new ResolveWall({ catalog, connections, cache, snapshots, secrets: new TransparentSecretBox(), runtime: new FakeRuntime(), clock });
  return { upstream, connections, cache, snapshots, clock, resolve, catalog };
}

const followers = () => aTile().withId("f").stat({ label: "Followers" }).metric("social", "followers", { connection: "soc-1" });
const socialConnection = (access: string, expiresAt: number | null = SOCIAL_TOKEN_EXPIRY) => {
  const builder = aConnection().withId("soc-1").ownedBy({ id: "user-1" }).forConnector("social").withPublic({ handle: "ada", refreshHours: "6" }).sealed(`sealed:{"access":"${access}","refresh":"r1"}`);
  return (expiresAt === null ? builder : builder.expiringAt(expiresAt)).build();
};

const visitors = (id = "v") => aTile().withId(id).stat({ label: "Visitors" }).metric("analytics", "visitors", { params: { site: "a.com" } });
const signups = (id = "s") => aTile().withId(id).stat({ label: "Signups" }).metric("analytics", "signups", { params: { site: "a.com" } });
const mrr = (connection: string | null = "conn-1") => aTile().withId("mrr").stat({ label: "MRR" }).metric("billing", "mrr", { connection });

describe("ResolveWall", () => {
  test("given tiles sharing an upstream call, when the wall renders, then the upstream is called once for all of them", async () => {
    // Given
    const { upstream, resolve } = setup();
    const owner = aUser().build();

    // When
    const { states } = await resolve.execute({ tiles: [visitors().build(), signups().build()], owner, surface: "page" });

    // Then
    expect(upstream.calls).toBe(1);
    expect(states.v).toMatchObject({ status: "ready", inputs: { value: { value: number(120), stale: false } } });
    expect(states.s).toMatchObject({ status: "ready", inputs: { value: { value: number(8) } } });
  });

  test("given a fresh cached value, when the wall renders again, then the upstream isn't called", async () => {
    // Given
    const { upstream, resolve } = setup();
    const owner = aUser().build();
    await resolve.execute({ tiles: [visitors().build()], owner, surface: "page" });

    // When
    await resolve.execute({ tiles: [visitors().build()], owner, surface: "page" });

    // Then
    expect(upstream.calls).toBe(1);
  });

  test("given an upstream that fails after a good read, when the cache expires, then the last value is served as stale", async () => {
    // Given
    const { upstream, clock, resolve } = setup();
    const owner = aUser().build();
    await resolve.execute({ tiles: [visitors().build()], owner, surface: "page" });
    upstream.mode = "fail";
    clock.advance(2 * 3600_000);

    // When
    const { states } = await resolve.execute({ tiles: [visitors().build()], owner, surface: "page" });

    // Then
    expect(states.v).toMatchObject({ status: "ready", inputs: { value: { value: number(120), stale: true } } });
  });

  test("given an upstream that never answers and no cache, when the wall renders, then it gives up within the deadline", async () => {
    // Given
    const { upstream, resolve } = setup();
    upstream.mode = "hang";
    const started = Date.now();

    // When
    const { states } = await resolve.execute({ tiles: [visitors().build()], owner: aUser().build(), surface: "page" });

    // Then
    expect(Date.now() - started).toBeLessThan(RENDER_DEADLINE_MS + 1000);
    expect(states.v).toMatchObject({ status: "placeholder", reason: "unavailable" });
  }, RENDER_DEADLINE_MS + 3000);

  test("given a Pro connector on a free owner's wall, when a stranger views it, then it waits for Pro, but the owner's editor shows it", async () => {
    // Given
    const { connections, resolve } = setup();
    const owner = aUser().withId("u1").build();
    await connections.save(aConnection().ownedBy(owner).forConnector("billing").sealed('sealed:{"key":"key_x"}').build());

    // When
    const page = await resolve.execute({ tiles: [mrr().build()], owner, surface: "page" });
    const editor = await resolve.execute({ tiles: [mrr().build()], owner, surface: "editor" });

    // Then
    expect(page.states.mrr).toMatchObject({ status: "placeholder", reason: "pro" });
    expect(editor.states.mrr).toMatchObject({ status: "ready", inputs: { value: { source: { connector: "billing", verified: true } } } });
  });

  test("given a Pro owner without the connection, when the wall renders, then the tile asks to connect", async () => {
    // Given
    const { resolve } = setup();

    // When
    const { states } = await resolve.execute({ tiles: [mrr(null).build()], owner: aUser().pro().build(), surface: "page" });

    // Then
    expect(states.mrr).toEqual({ status: "placeholder", reason: "connect", message: "Connect Billing" });
  });

  test("given a connection whose secret can't be opened, when the wall renders, then the owner is asked to reconnect", async () => {
    // Given
    const { connections, resolve } = setup();
    const owner = aUser().withId("u1").pro().build();
    await connections.save(aConnection().ownedBy(owner).forConnector("billing").sealed("rotated-key-garbage").build());

    // When
    const { states } = await resolve.execute({ tiles: [mrr().build()], owner, surface: "editor" });

    // Then
    expect(states.mrr).toMatchObject({ status: "placeholder", message: "Reconnect Billing: its credentials can't be read anymore." });
  });

  test("given days of recorded MRR, when a history tile renders, then it gets a series ending with today's live value", async () => {
    // Given
    const { connections, snapshots, upstream, resolve } = setup();
    const owner = aUser().withId("u1").pro().build();
    await connections.save(aConnection().ownedBy(owner).forConnector("billing").sealed('sealed:{"key":"key_x"}').build());
    upstream.answer = { mrr: money(5000, "usd") };
    const tile = aTile().withId("trend").widget("sparkline", { label: "MRR" }).metric("billing", "mrr", { connection: "conn-1", history: "30d" }, "series").build();
    const key = seriesKey(tile.inputs.series as never);
    await snapshots.record(key, "2026-09-12", 4600);
    await snapshots.record(key, "2026-09-13", 4800);

    // When
    const { states } = await resolve.execute({ tiles: [tile], owner, surface: "page" });

    // Then
    const state = states.trend;
    expect(state.status).toBe("ready");
    const value = state.status === "ready" ? state.inputs.series.value : null;
    expect(value).toMatchObject({ type: "series", points: [{ t: "2026-09-12", v: 4600 }, { t: "2026-09-13", v: 4800 }, { t: "2026-09-14", v: 5000 }] });
  });

  test("given a public render, when numbers resolve, then today's snapshot is recorded; editor previews record nothing", async () => {
    // Given
    const { snapshots, resolve } = setup();
    const owner = aUser().build();

    // When
    await resolve.execute({ tiles: [visitors().build()], owner, surface: "editor" });
    const afterEditor = snapshots.items.size;
    await resolve.execute({ tiles: [visitors().build()], owner, surface: "lockscreen" });

    // Then
    expect(afterEditor).toBe(0);
    expect([...snapshots.items.values()][0].get("2026-09-14")).toBe(120);
  });

  test("given a listing that reads cache only, when nothing is cached, then no upstream is called", async () => {
    // Given
    const { upstream, resolve } = setup();

    // When
    const { states } = await resolve.execute({ tiles: [visitors().build()], owner: aUser().build(), surface: "page", cacheOnly: true });

    // Then
    expect(upstream.calls).toBe(0);
    expect(states.v.status).toBe("placeholder");
  });

  test("given an owner in Tokyo, when the wall renders at 23:30 UTC, then today is already tomorrow for them", async () => {
    // Given
    const { clock, resolve } = setup();
    clock.time = Date.UTC(2026, 8, 14, 23, 30);

    // When
    const { today } = await resolve.execute({ tiles: [], owner: aUser().inTimeZone("Asia/Tokyo").build(), surface: "page" });

    // Then
    expect(today).toBe("2026-09-15");
  });

  test("given a token about to lapse, when the wall renders, then it's renewed once, saved sealed, and the fetch uses the new one", async () => {
    // Given
    const { upstream, connections, clock, resolve } = setup();
    await connections.save(socialConnection("a1"));
    clock.time = SOCIAL_TOKEN_EXPIRY - 60_000;

    // When
    const { states } = await resolve.execute({ tiles: [followers().build()], owner: aUser().withId("user-1").build(), surface: "page" });

    // Then
    expect(states.f).toMatchObject({ status: "ready", inputs: { value: { value: number(1613, { unit: "count" }) } } });
    expect(upstream.refreshes).toBe(1);
    const saved = (await connections.byId("soc-1"))!;
    expect(saved.sealed).toBe('sealed:{"access":"a2","refresh":"r1+"}');
    expect(saved.expiresAt).toBe(SOCIAL_TOKEN_EXPIRY + 3600_000);
  });

  test("given a provider that says the token expired early, when the wall renders, then it's renewed and the fetch tried once more", async () => {
    // Given
    const { upstream, connections, resolve } = setup();
    await connections.save(socialConnection("expired", null));

    // When
    const { states } = await resolve.execute({ tiles: [followers().build()], owner: aUser().withId("user-1").build(), surface: "page" });

    // Then
    expect(states.f).toMatchObject({ status: "ready" });
    expect(upstream.refreshes).toBe(1);
    expect(upstream.calls).toBe(1);
  });

  test("given a revoked sign-in, when the token needs renewing, then the owner is asked to reconnect", async () => {
    // Given
    const { upstream, connections, clock, resolve } = setup();
    await connections.save(socialConnection("a1"));
    upstream.refreshMode = "revoked";
    clock.time = SOCIAL_TOKEN_EXPIRY + 1;

    // When
    const { states } = await resolve.execute({ tiles: [followers().build()], owner: aUser().withId("user-1").build(), surface: "editor" });

    // Then
    expect(states.f).toMatchObject({ status: "placeholder", message: "Reconnect Social: access was revoked." });
    expect(upstream.calls).toBe(0);
  });

  test("given a connection that chose to refresh every 6 hours, when its freshness is read, then it's 6 hours but never under the connector's floor", () => {
    // Given
    const { catalog } = setup();
    const social = catalog.connector("social")!;

    // When / Then
    expect(freshnessSeconds(social, socialConnection("a1"))).toBe(6 * 3600);
    expect(freshnessSeconds(social, { ...socialConnection("a1"), public: { refreshHours: "0" } })).toBe(600);
    expect(freshnessSeconds(social, { ...socialConnection("a1"), public: {} })).toBe(600);
    expect(freshnessSeconds(social, null)).toBe(600);
  });
});
