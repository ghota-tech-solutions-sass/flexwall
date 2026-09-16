import { describe, expect, test } from "bun:test";
import { GetCredits, usesCredits } from "@/application/use-cases/credits";
import { aConnection, aUser } from "../builders";
import { InMemoryConnections, InMemoryCredits } from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

function setup() {
  const { catalog } = testCatalog();
  const connections = new InMemoryConnections();
  const credits = new InMemoryCredits();
  return { connections, credits, get: new GetCredits({ credits, connections, catalog }) };
}

describe("An owner's credits", () => {
  test("given an owner with no account Flexwall pays to read, when their credits are read, then nothing concerns them", async () => {
    // Given
    const { connections, get } = setup();
    await connections.save(aConnection().withId("c1").ownedBy(aUser().withId("u1").build()).forConnector("billing").build());

    // When
    const view = await get.execute({ userId: "u1" });

    // Then
    expect(view).toMatchObject({ balance: 0, perDay: 0, daysLeft: null, metered: [] });
    expect(usesCredits(view)).toBe(false);
  });

  test("given two metered accounts and a balance, when credits are read, then the daily pace and the days left follow", async () => {
    // Given
    const { connections, credits, get } = setup();
    const owner = aUser().withId("u1").build();
    await connections.save(aConnection().withId("m1").ownedBy(owner).forConnector("metered").withLabel("@ada").build());
    await connections.save(aConnection().withId("m2").ownedBy(owner).forConnector("metered").withLabel("@bob").build());
    await credits.adjust({ userId: "u1", entryId: "evt_1", amount: 9, reason: "purchase", detail: "starter" });

    // When
    const view = await get.execute({ userId: "u1" });

    // Then
    expect(view).toMatchObject({ balance: 9, perDay: 2, daysLeft: 4 });
    expect(view.metered.map((m) => m.label)).toEqual(["@ada", "@bob"]);
    expect(usesCredits(view)).toBe(true);
  });

  test("given an owner who spent every credit they bought, when their credits are read, then the section still concerns them", async () => {
    // Given
    const { credits, get } = setup();
    await credits.adjust({ userId: "u1", entryId: "evt_1", amount: 1, reason: "purchase", detail: "starter" });
    await credits.spend({ userId: "u1", key: "m1", day: "2026-09-16", amount: 1, detail: "@ada" });

    // When
    const view = await get.execute({ userId: "u1" });

    // Then
    expect(view.balance).toBe(0);
    expect(usesCredits(view)).toBe(true);
  });
});
