import { describe, expect, test } from "bun:test";
import { money, number } from "@flexwall/sdk";
import { ListExplore, ReportWall } from "@/application/use-cases/explore";
import { GetLockscreen } from "@/application/use-cases/lockscreen";
import { ResolveWall } from "@/application/use-cases/resolve-wall";
import { aConnection, aTile, aUser, aWall, NOW } from "../builders";
import {
  FakeRuntime,
  FakeTokens,
  FixedClock,
  InMemoryConnections,
  InMemorySnapshots,
  InMemoryUsers,
  InMemoryValueCache,
  InMemoryWalls,
  RecordingMailer,
  TransparentSecretBox,
} from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

describe("GetLockscreen", () => {
  test("given the right key, when the Shortcut fetches, then placed tiles come back, private ones included", async () => {
    // Given
    const walls = new InMemoryWalls();
    const users = new InMemoryUsers();
    const owner = aUser().withId("u1").build();
    await users.save(owner);
    await walls.save(aWall().ownedBy(owner).with(aTile().withId("secret").note().private()).onLockscreen("secret", { x: 0, y: 0, w: 4, h: 1 }).build());
    const getLockscreen = new GetLockscreen({ walls, users, tokens: new FakeTokens() });

    // When
    const { placed } = await getLockscreen.execute({ wallId: "wall-1", key: "lock:wall-1:nonce-1" });

    // Then
    expect(placed.map((p) => p.tile.id)).toEqual(["secret"]);
  });

  test("given a wrong key, when fetched, then the wall doesn't exist", async () => {
    // Given
    const walls = new InMemoryWalls();
    await walls.save(aWall().build());
    const getLockscreen = new GetLockscreen({ walls, users: new InMemoryUsers(), tokens: new FakeTokens() });

    // When
    const attempt = getLockscreen.execute({ wallId: "wall-1", key: "lock:wall-1:guess" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ListExplore", () => {
  async function setup() {
    const { catalog, upstream } = testCatalog();
    const walls = new InMemoryWalls();
    const users = new InMemoryUsers();
    const connections = new InMemoryConnections();
    const cache = new InMemoryValueCache();
    const clock = new FixedClock();
    const resolve = new ResolveWall({ catalog, connections, cache, snapshots: new InMemorySnapshots(), secrets: new TransparentSecretBox(), runtime: new FakeRuntime(), clock });
    const listExplore = new ListExplore({ walls, users, resolve, catalog, clock });

    const listedWithRevenue = async (id: string, amount: number) => {
      const owner = aUser().withId(id).withHandle(id).pro().build();
      await users.save(owner);
      await connections.save(aConnection().withId(`c-${id}`).ownedBy(owner).forConnector("billing").sealed('sealed:{"key":"key_x"}').build());
      await walls.save(aWall().withId(`w-${id}`).ownedBy(owner).listed().with(aTile().withId("mrr").stat({ label: "MRR" }).metric("billing", "mrr", { connection: `c-${id}` })).build());
      await cache.set(`billing|c-${id}|account`, { at: NOW, values: { mrr: money(amount, "usd") } });
    };
    return { walls, users, cache, upstream, listExplore, listedWithRevenue };
  }

  test("given listed walls with verified revenue in cache, when sorted by revenue, then the highest comes first, without calling anyone's account", async () => {
    // Given
    const { upstream, listExplore, listedWithRevenue } = await setup();
    await listedWithRevenue("small", 900);
    await listedWithRevenue("big", 12_000);

    // When
    const entries = await listExplore.execute({ sort: "revenue" });

    // Then
    expect(entries.map((e) => e.handle)).toEqual(["big", "small"]);
    expect(entries[0].highlights).toEqual([{ label: "MRR", value: "$12k", connector: "Billing" }]);
    expect(upstream.calls).toBe(0);
  });

  test("given published walls that didn't opt in, when Explore lists, then they're not there", async () => {
    // Given
    const { walls, users, listExplore } = await setup();
    const owner = aUser().withId("quiet").withHandle("quiet").build();
    await users.save(owner);
    await walls.save(aWall().withId("w-quiet").ownedBy(owner).build());

    // When
    const entries = await listExplore.execute({ sort: "recent" });

    // Then
    expect(entries).toEqual([]);
  });

  test("given self-typed numbers, when Explore picks highlights, then unverified numbers are left out", async () => {
    // Given
    const { walls, users, listExplore } = await setup();
    const owner = aUser().withId("typed").withHandle("typed").build();
    await users.save(owner);
    await walls.save(aWall().withId("w-typed").ownedBy(owner).listed().with(aTile().withId("fake").stat({ label: "MRR" }).static(number(1_000_000))).build());

    // When
    const [entry] = await listExplore.execute({ sort: "recent" });

    // Then
    expect(entry.highlights).toEqual([]);
    expect(entry.ranks.revenue).toBeUndefined();
  });
});

describe("ReportWall", () => {
  test("given a report about a wall, when sent, then moderation gets it with the reason escaped", async () => {
    // Given
    const walls = new InMemoryWalls();
    const mailer = new RecordingMailer();
    await walls.save(aWall().build());
    const report = new ReportWall({ walls, mailer, moderationInbox: "mod@flexwall.test" });

    // When
    await report.execute({ handle: "ADA", reason: "Impersonating <b>me</b>" });

    // Then
    expect(mailer.sent[0]).toMatchObject({ to: "mod@flexwall.test", subject: "Report: @ada" });
    expect(mailer.sent[0].html).toContain("&lt;b&gt;me&lt;/b&gt;");
  });
});
