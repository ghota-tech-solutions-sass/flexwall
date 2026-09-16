import { describe, expect, test } from "bun:test";
import { GetAccount, GrantPaidAccounts, IsAdministrator, ListAccounts, ModerateWall, OfferPro, WithdrawPro } from "@/application/use-cases/admin";
import { aConnection, aUser, aWall, NOW } from "../builders";
import { FixedClock, InMemoryConnections, InMemoryUsers, InMemoryWalls } from "../fakes";

async function setup() {
  const users = new InMemoryUsers();
  const walls = new InMemoryWalls();
  const connections = new InMemoryConnections();
  const deps = { users, walls, connections, clock: new FixedClock(NOW), administrators: ["boss@flexwall.lol"] };
  const boss = aUser().withId("boss").withEmail("boss@flexwall.lol").withHandle("boss").build();
  const ada = aUser().withId("ada").withEmail("ada@example.com").withHandle("ada").build();
  const eve = aUser().withId("eve").withEmail("eve@example.com").withHandle("eve").pro().build();
  for (const u of [boss, ada, eve]) await users.save(u);
  await walls.save(aWall().withId("w-ada").ownedBy(ada).listed().build());
  await connections.save(aConnection().withId("c-ada").ownedBy(ada).forConnector("stripe").build());
  return {
    users,
    walls,
    grant: new GrantPaidAccounts(deps),
    list: new ListAccounts(deps),
    get: new GetAccount(deps),
    offer: new OfferPro(deps),
    withdraw: new WithdrawPro(deps),
    moderate: new ModerateWall(deps),
    isAdmin: new IsAdministrator(deps),
  };
}

describe("The back office", () => {
  test("given someone who isn't an administrator, when they open any of it, then it doesn't exist for them", async () => {
    // Given
    const { list, get, offer, moderate, isAdmin } = await setup();

    // When
    const attempts = [
      () => list.execute({ userId: "eve" }),
      () => get.execute({ userId: "eve", accountId: "ada" }),
      () => offer.execute({ userId: "eve", accountId: "eve", term: "forever", note: "" }),
      () => moderate.execute({ userId: null, accountId: "ada", published: false }),
    ];

    // Then
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: "not_found" });
    expect(await isAdmin.execute({ userId: "eve" })).toBe(false);
    expect(await isAdmin.execute({ userId: "boss" })).toBe(true);
  });

  test("given accounts, when an administrator searches by handle or filters by plan, then only matching accounts come back", async () => {
    // Given
    const { list } = await setup();

    // When
    const byHandle = await list.execute({ userId: "boss", query: "@ADA" });
    const subscribers = await list.execute({ userId: "boss", source: "subscription" });

    // Then
    expect(byHandle.accounts.map((a) => a.id)).toEqual(["ada"]);
    expect(subscribers.accounts.map((a) => a.id)).toEqual(["eve"]);
    expect(byHandle.total).toBe(3);
  });

  test("given a free account, when an administrator offers Pro, then it's Pro, recorded with who gave it, and shows as offered", async () => {
    // Given
    const { offer, get, users } = await setup();

    // When
    const row = await offer.execute({ userId: "boss", accountId: "ada", term: "1y", note: "Launch partner" });

    // Then
    expect(row).toMatchObject({ plan: "pro", source: "complimentary" });
    expect((await users.byId("ada"))!.complimentary).toMatchObject({ grantedBy: "boss@flexwall.lol", note: "Launch partner" });
    const detail = await get.execute({ userId: "boss", accountId: "ada" });
    expect(detail.connections.map((c) => c.id)).toEqual(["c-ada"]);
    expect(detail.wall).toMatchObject({ handle: "ada", published: true, listed: true });
  });

  test("given offered Pro, when an administrator takes it back, then the account is free again, and taking back nothing is refused", async () => {
    // Given
    const { offer, withdraw } = await setup();
    await offer.execute({ userId: "boss", accountId: "ada", term: "forever", note: "" });

    // When
    const row = await withdraw.execute({ userId: "boss", accountId: "ada" });
    const again = withdraw.execute({ userId: "boss", accountId: "ada" });

    // Then
    expect(row).toMatchObject({ plan: "free", source: "free" });
    await expect(again).rejects.toMatchObject({ code: "invalid_input" });
  });

  test("given a reported wall, when an administrator unpublishes it, then it's offline and off The Wall too", async () => {
    // Given
    const { moderate, walls } = await setup();

    // When
    const state = await moderate.execute({ userId: "boss", accountId: "ada", published: false });

    // Then
    expect(state).toEqual({ published: false, listed: false });
    expect((await walls.byOwner("ada"))!).toMatchObject({ published: false, listed: false });
  });
});

describe("Paid accounts in the back office", () => {
  test("given an administrator, when they give an account connected accounts, then it may connect that many", async () => {
    // Given
    const { grant, users } = await setup();

    // When
    const result = await grant.execute({ userId: "boss", accountId: "ada", accounts: 2 });

    // Then
    expect(result).toEqual({ granted: 2 });
    expect((await users.byId("ada"))!.paidAccountsGranted).toBe(2);
  });

  test("given someone who isn't an administrator, when they give themselves accounts, then nothing is given", async () => {
    // Given
    const { grant, users } = await setup();

    // When
    const attempt = grant.execute({ userId: "eve", accountId: "eve", accounts: 5 });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "not_found" });
    expect((await users.byId("eve"))!.paidAccountsGranted ?? 0).toBe(0);
  });

  test("given a number that isn't a sensible count, when an administrator sends it, then it's refused", async () => {
    // Given
    const { grant } = await setup();

    // When
    const attempts = [-1, 2.5, Number.NaN, 99].map((accounts) => () => grant.execute({ userId: "boss", accountId: "ada", accounts }));

    // Then
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: "invalid_input" });
  });
});
