import { describe, expect, test } from "bun:test";
import { ConnectorAccess, GetConnectorControls, ListPublicConnectors, POLICY_CACHE_MS, SetConnectorAvailability } from "@/application/use-cases/connector-policy";
import { aConnection, aUser, NOW } from "../builders";
import { FakeRuntime, FixedClock, InMemoryConnections, InMemoryConnectorPolicies, InMemoryUsers } from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

async function setup() {
  const { catalog } = testCatalog();
  const users = new InMemoryUsers();
  const connections = new InMemoryConnections();
  const policies = new InMemoryConnectorPolicies();
  const clock = new FixedClock();
  const access = new ConnectorAccess({ catalog, policies, runtime: new FakeRuntime(), clock });
  const administrators = ["boss@flexwall.lol"];
  const deps = { users, connections, policies, access, catalog, clock, administrators };
  await users.save(aUser().withId("boss").withEmail("boss@flexwall.lol").build());
  await users.save(aUser().withId("ada").withEmail("ada@example.com").build());
  return {
    policies,
    access,
    clock,
    connections,
    controls: new GetConnectorControls(deps),
    set: new SetConnectorAvailability(deps),
    publicConnectors: new ListPublicConnectors({ access }),
  };
}

describe("Connectors in the back office", () => {
  test("given someone who isn't an administrator, when they read or change connectors, then it doesn't exist for them", async () => {
    // Given
    const { controls, set } = await setup();

    // When
    const attempts = [() => controls.execute({ userId: "ada" }), () => set.execute({ userId: null, connectorId: "billing", availability: "off" })];

    // Then
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: "not_found" });
  });

  test("given connections on a connector, when an administrator lists them, then each one shows how many accounts use it", async () => {
    // Given
    const { controls, connections } = await setup();
    await connections.save(aConnection().withId("c1").forConnector("billing").build());
    await connections.save(aConnection().withId("c2").forConnector("billing").build());

    // When
    const list = await controls.execute({ userId: "boss" });

    // Then
    expect(list.find((c) => c.id === "billing")).toMatchObject({ connections: 2, chosen: "everyone", effective: "everyone", override: null });
    expect(list.find((c) => c.id === "analytics")).toMatchObject({ connections: 0, status: null });
  });

  test("given an administrator taking a connector off, when owners look for it, then it's gone and the change is on record", async () => {
    // Given
    const { set, controls, publicConnectors } = await setup();

    // When
    const changed = await set.execute({ userId: "boss", connectorId: "billing", availability: "off" });

    // Then
    expect(changed).toEqual({ id: "billing", chosen: "off", effective: "off" });
    expect(await publicConnectors.execute()).not.toContain("billing");
    expect((await controls.execute({ userId: "boss" })).find((c) => c.id === "billing")).toMatchObject({ changedBy: "boss@flexwall.lol", changedAt: NOW });
  });

  test("given a connector kept to administrators, when the two of them ask, then only the administrator may use it", async () => {
    // Given
    const { set, access } = await setup();
    await set.execute({ userId: "boss", connectorId: "billing", availability: "admins" });

    // When
    const forVisitors = await access.allowedFor({ administrator: false });
    const forAdmins = await access.allowedFor({ administrator: true });

    // Then
    expect(forVisitors).not.toContain("billing");
    expect(forAdmins).toContain("billing");
  });

  test("given an unrecognised availability, when an administrator sends it, then it's refused", async () => {
    // Given
    const { set } = await setup();

    // When
    const attempt = set.execute({ userId: "boss", connectorId: "billing", availability: "sometimes" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
  });

  test("given a connector on its provider's sandbox, when an administrator opens it to everyone, then it's refused and it stays with administrators", async () => {
    // Given
    const { set, controls, publicConnectors } = await setup();

    // When
    const attempt = set.execute({ userId: "boss", connectorId: "sandboxed", availability: "everyone" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect((await controls.execute({ userId: "boss" })).find((c) => c.id === "sandboxed")).toMatchObject({ effective: "admins", override: "sandbox" });
    expect(await publicConnectors.execute()).not.toContain("sandboxed");
  });

  test("given a policy read once, when a wall renders again within the minute, then the store isn't read again", async () => {
    // Given
    const { policies, clock } = await setup();
    let reads = 0;
    const counted = { all: () => (reads++, policies.all()), save: policies.save.bind(policies) };
    const access = new ConnectorAccess({ catalog: testCatalog().catalog, policies: counted, runtime: new FakeRuntime(), clock });

    // When
    await access.all();
    await access.all();
    clock.advance(POLICY_CACHE_MS + 1);
    await access.all();

    // Then
    expect(reads).toBe(2);
  });
});
