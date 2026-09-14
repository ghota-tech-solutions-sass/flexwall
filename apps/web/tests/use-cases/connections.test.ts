import { describe, expect, test } from "bun:test";
import { ConnectAccount, RemoveConnection } from "@/application/use-cases/connections";
import { aConnection, aUser } from "../builders";
import { FakeRuntime, FixedClock, InMemoryConnections, InMemoryUsers, SequentialIds, TransparentSecretBox } from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

async function setup() {
  const users = new InMemoryUsers();
  const connections = new InMemoryConnections();
  const secrets = new TransparentSecretBox();
  const { catalog } = testCatalog();
  await users.save(aUser().withId("u1").build());
  const connect = new ConnectAccount({ users, connections, catalog, runtime: new FakeRuntime(), secrets, ids: new SequentialIds(), clock: new FixedClock() });
  return { users, connections, secrets, connect };
}

describe("ConnectAccount", () => {
  test("given valid credentials, when the owner connects, then the secret is sealed and only public details come back", async () => {
    // Given
    const { connections, secrets, connect } = await setup();

    // When
    const view = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_live_42" } });

    // Then
    expect(view).toMatchObject({ connector: "billing", label: "Billing account", public: { hint: "key_…42" } });
    expect(JSON.stringify(view)).not.toContain("key_live_42");
    const stored = (await connections.byId(view.id))!;
    expect(stored.sealed).not.toBe("key_live_42");
    expect(secrets.open(stored.sealed)).toEqual({ key: "key_live_42" });
  });

  test("given credentials the form refuses, when the owner connects, then the connector is never called", async () => {
    // Given
    const { connections, connect } = await setup();

    // When
    const attempt = connect.execute({ userId: "u1", connector: "billing", values: { key: "nope" } });

    // Then
    await expect(attempt).rejects.toThrow("Key must start with key_.");
    expect(connections.items.size).toBe(0);
  });

  test("given credentials the upstream rejects, when the owner connects, then its sentence is shown and nothing is stored", async () => {
    // Given
    const { connections, connect } = await setup();

    // When
    const attempt = connect.execute({ userId: "u1", connector: "billing", values: { key: "key_revoked" } });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "connection_failed", message: "That key was revoked." });
    expect(connections.items.size).toBe(0);
  });

  test("given an account already connected, when the owner connects it again, then the connection is replaced, not duplicated", async () => {
    // Given
    const { connections, connect } = await setup();
    const first = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_old_11" } });

    // When
    const second = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_new_22" } });

    // Then
    expect(second.id).toBe(first.id);
    expect(connections.items.size).toBe(1);
  });

  test("given a connector that reads public data, when the owner tries to connect it, then they're told no account is needed", async () => {
    // Given
    const { connect } = await setup();

    // When
    const attempt = connect.execute({ userId: "u1", connector: "analytics", values: {} });

    // Then
    await expect(attempt).rejects.toThrow("Analytics doesn't need an account.");
  });
});

describe("RemoveConnection", () => {
  test("given someone else's connection, when a user removes it, then it's refused and kept", async () => {
    // Given
    const connections = new InMemoryConnections();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u2" }).build());
    const remove = new RemoveConnection({ connections });

    // When
    const attempt = remove.execute({ userId: "u1", connectionId: "c1" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "forbidden" });
    expect(connections.items.has("c1")).toBe(true);
  });
});
