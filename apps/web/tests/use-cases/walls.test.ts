import { describe, expect, test } from "bun:test";
import { money, text } from "@flexwall/sdk";
import { GetOwnerWall, GetPublicWall, RotateLockscreenLink, SaveWall } from "@/application/use-cases/walls";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { aConnection, aTile, aUser, aWall } from "../builders";
import { FakeLinks, FakeTokens, FixedClock, InMemoryConnections, InMemoryUsers, InMemoryWalls, SequentialIds } from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

async function setup(user = aUser().withId("u1").build()) {
  const users = new InMemoryUsers();
  const walls = new InMemoryWalls();
  const connections = new InMemoryConnections();
  const clock = new FixedClock();
  const { catalog } = testCatalog();
  await users.save(user);
  await walls.save(aWall().ownedBy(user).build());
  return {
    users,
    walls,
    connections,
    clock,
    saveWall: new SaveWall({ users, walls, connections, catalog, clock }),
    getOwnerWall: new GetOwnerWall({ users, walls, connections, tokens: new FakeTokens(), links: new FakeLinks(), clock }),
    getPublicWall: new GetPublicWall({ walls, users, clock }),
  };
}

describe("SaveWall", () => {
  test("given valid tiles, when the owner saves, then the wall keeps them with defaults filled in", async () => {
    // Given
    const { saveWall, walls } = await setup();
    const draft = aWall()
      .with(aTile().withId("mrr").stat({ label: "MRR" }).static(money(1200, "usd")).at(0, 0, 2, 1))
      .with(aTile().withId("hi").note("Hi").at(2, 0, 2, 1))
      .draft();

    // When
    await saveWall.execute({ userId: "u1", draft });

    // Then
    const saved = (await walls.byOwner("u1"))!;
    expect(saved.tiles.map((t) => t.id)).toEqual(["mrr", "hi"]);
    expect(saved.tiles[0].options).toMatchObject({ label: "MRR" });
  });

  test("given two tiles on the same cells, when the owner saves, then the overlap is named", async () => {
    // Given
    const { saveWall } = await setup();
    const draft = aWall().with(aTile().withId("a").note().at(0, 0, 2, 1)).with(aTile().withId("b").note().at(1, 0, 2, 1)).draft();

    // When
    const attempt = saveWall.execute({ userId: "u1", draft });

    // Then
    await expect(attempt).rejects.toThrow("The Note tile at row 1, column 2: it overlaps the Note tile at row 1, column 1.");
  });

  test("given a tile larger than its widget allows, when saved, then it's refused", async () => {
    // Given
    const { saveWall } = await setup();
    const draft = aWall().with(aTile().withId("big").note().at(0, 0, 4, 3)).draft();

    // When
    const attempt = saveWall.execute({ userId: "u1", draft });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_wall" });
  });

  test("given a binding of the wrong type, when saved, then the widget's expectation is explained", async () => {
    // Given
    const { saveWall } = await setup();
    const draft = aWall().with(aTile().withId("s").stat().static(text("not a number"))).draft();

    // When
    const attempt = saveWall.execute({ userId: "u1", draft });

    // Then
    await expect(attempt).rejects.toThrow('"value" takes number or series, not text.');
  });

  test("given someone else's connection, when a tile points at it, then the save is refused", async () => {
    // Given
    const { saveWall, connections } = await setup();
    await connections.save(aConnection().withId("theirs").ownedBy({ id: "u2" }).forConnector("billing").build());
    const draft = aWall().with(aTile().withId("mrr").stat().metric("billing", "mrr", { connection: "theirs" })).draft();

    // When
    const attempt = saveWall.execute({ userId: "u1", draft });

    // Then
    await expect(attempt).rejects.toThrow("that Billing connection isn't yours.");
  });

  test("given a free plan, when the owner saves more tiles than it allows, then they're pointed to Pro", async () => {
    // Given
    const { saveWall } = await setup();
    const draft = aWall();
    for (let i = 0; i <= FREE_TILE_LIMIT; i++) draft.with(aTile().withId(`t${i}`).note().at(0, i, 1, 1));

    // When
    const attempt = saveWall.execute({ userId: "u1", draft: draft.draft() });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "plan_limit" });
  });

  test("given a free owner, when they save a Pro theme, then it's refused and they're pointed to Pro", async () => {
    // Given
    const { saveWall, walls } = await setup();
    const draft = aWall().theme("sunset").draft();

    // When
    const attempt = saveWall.execute({ userId: "u1", draft });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "plan_limit", message: "Sunset is a Pro theme. Go Pro to use it." });
    expect((await walls.byOwner("u1"))!.theme).toBe("night");
  });

  test("given a Pro theme kept from a lapsed plan, when the owner saves other changes, then the theme stays for when Pro is back", async () => {
    // Given
    const owner = aUser().withId("u1").build();
    const { saveWall, walls } = await setup(owner);
    await walls.save(aWall().ownedBy(owner).theme("sunset").build());

    // When
    await saveWall.execute({ userId: "u1", draft: aWall().theme("sunset").draft() });

    // Then
    expect((await walls.byOwner("u1"))!.theme).toBe("sunset");
  });

  test("given a Pro owner, when they pick a Pro theme, then it's saved", async () => {
    // Given
    const { saveWall, walls } = await setup(aUser().withId("u1").pro().build());

    // When
    await saveWall.execute({ userId: "u1", draft: aWall().theme("sunset").draft() });

    // Then
    expect((await walls.byOwner("u1"))!.theme).toBe("sunset");
  });

  test("given a Pro owner, when they save the same tiles, then the limit doesn't apply", async () => {
    // Given
    const { saveWall, walls } = await setup(aUser().withId("u1").pro().build());
    const draft = aWall();
    for (let i = 0; i <= FREE_TILE_LIMIT; i++) draft.with(aTile().withId(`t${i}`).note().at(0, i, 1, 1));

    // When
    await saveWall.execute({ userId: "u1", draft: draft.draft() });

    // Then
    expect((await walls.byOwner("u1"))!.tiles).toHaveLength(FREE_TILE_LIMIT + 1);
  });

  test("given an unpublished wall, when the owner asks to be listed, then it stays unlisted", async () => {
    // Given
    const { saveWall, walls } = await setup();
    const draft = { ...aWall().draft(), published: false, listed: true };

    // When
    await saveWall.execute({ userId: "u1", draft });

    // Then
    expect((await walls.byOwner("u1"))!.listed).toBe(false);
  });

  test("given a lock screen placement for a removed tile, when saved, then the placement is dropped", async () => {
    // Given
    const { saveWall, walls } = await setup();
    const draft = aWall().with(aTile().withId("kept").note()).onLockscreen("kept", { x: 0, y: 0, w: 2, h: 1 }).onLockscreen("gone", { x: 2, y: 0, w: 2, h: 1 }).draft();

    // When
    await saveWall.execute({ userId: "u1", draft });

    // Then
    expect((await walls.byOwner("u1"))!.lockscreen.placements.map((p) => p.tileId)).toEqual(["kept"]);
  });
});

describe("GetPublicWall", () => {
  test("given a published wall, when a stranger opens it, then only public tiles are shown", async () => {
    // Given
    const { walls, getPublicWall } = await setup();
    await walls.save(aWall().ownedBy(aUser().withId("u1").build()).with(aTile().withId("pub").note()).with(aTile().withId("secret").note().private().at(2, 0)).build());

    // When
    const { wall, preview } = await getPublicWall.execute({ handle: "@ADA" });

    // Then
    expect(wall.tiles.map((t) => t.id)).toEqual(["pub"]);
    expect(preview).toBe(false);
  });

  test("given an unpublished wall, when a stranger opens it, then it doesn't exist, but its owner can preview it", async () => {
    // Given
    const { walls, getPublicWall } = await setup();
    await walls.save(aWall().ownedBy(aUser().withId("u1").build()).unpublished().build());

    // When
    const stranger = getPublicWall.execute({ handle: "ada", viewerId: "u2" });
    const owner = await getPublicWall.execute({ handle: "ada", viewerId: "u1" });

    // Then
    await expect(stranger).rejects.toMatchObject({ code: "not_found" });
    expect(owner.preview).toBe(true);
  });
});

describe("GetOwnerWall", () => {
  test("given connections with sealed secrets, when the editor loads, then no secret reaches it", async () => {
    // Given
    const { connections, getOwnerWall } = await setup();
    await connections.save(aConnection().ownedBy({ id: "u1" }).sealed('sealed:{"key":"rk_live_topsecret"}').build());

    // When
    const owner = await getOwnerWall.execute({ userId: "u1" });

    // Then
    expect(JSON.stringify(owner.connections)).not.toContain("topsecret");
    expect(owner.lockscreenPath).toBe("/l/wall-1/lock:wall-1:nonce-1");
    expect(owner.entitlements.plan).toBe("free");
  });
});

describe("RotateLockscreenLink", () => {
  test("given a lock screen link, when the owner rotates it, then the old key no longer verifies", async () => {
    // Given
    const walls = new InMemoryWalls();
    const tokens = new FakeTokens();
    await walls.save(aWall().ownedBy(aUser().withId("u1").build()).build());
    const rotate = new RotateLockscreenLink({ walls, ids: new SequentialIds(), tokens, links: new FakeLinks(), clock: new FixedClock() });

    // When
    const { lockscreenPath } = await rotate.execute({ userId: "u1" });

    // Then
    const wall = (await walls.byOwner("u1"))!;
    expect(tokens.verifyLockKey(wall.id, wall.lockNonce, "lock:wall-1:nonce-1")).toBe(false);
    expect(lockscreenPath).toBe(`/l/wall-1/lock:wall-1:${wall.lockNonce}`);
  });
});

