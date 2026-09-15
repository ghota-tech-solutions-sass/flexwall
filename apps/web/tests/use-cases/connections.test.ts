import { describe, expect, test } from "bun:test";
import { ConnectAccount, FinishConnectionSignIn, RemoveConnection, RenameConnection, StartConnectionSignIn } from "@/application/use-cases/connections";
import { OAUTH_PENDING_TTL_MS } from "@/domain/connection";
import { aConnection, aUser } from "../builders";
import { FakeLinks, FakeRuntime, FixedClock, InMemoryConnections, InMemoryUsers, SequentialIds, TransparentSecretBox } from "../fakes";
import { SOCIAL_TOKEN_EXPIRY, testCatalog } from "../fakes/test-plugin";

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

  test("given an account the owner named, when they connect it again with a new key, then the name stays", async () => {
    // Given
    const { connections, connect } = await setup();
    const first = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_old_11" } });
    await new RenameConnection({ connections }).execute({ userId: "u1", connectionId: first.id, nickname: "Main shop" });

    // When
    const second = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_new_22" } });

    // Then
    expect(second).toMatchObject({ id: first.id, nickname: "Main shop", public: { hint: "key_…22" } });
  });

  test("given a brand new account, when connected, then it has no name of its own yet", async () => {
    // Given
    const { connect } = await setup();

    // When
    const view = await connect.execute({ userId: "u1", connector: "billing", values: { key: "key_live_42" } });

    // Then
    expect(view.nickname).toBeNull();
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

describe("RenameConnection", () => {
  function renameSetup() {
    const connections = new InMemoryConnections();
    return { connections, rename: new RenameConnection({ connections }) };
  }

  test("given the owner's connection, when they name it with spaces around, then the trimmed name is saved and comes back", async () => {
    // Given
    const { connections, rename } = renameSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u1" }).forConnector("billing").build());

    // When
    const view = await rename.execute({ userId: "u1", connectionId: "c1", nickname: "  Side project " });

    // Then
    expect(view).toMatchObject({ id: "c1", nickname: "Side project" });
    expect((await connections.byId("c1"))!.nickname).toBe("Side project");
    expect((await connections.byId("c1"))!.sealed).toContain("rk_live");
  });

  test("given a named connection, when the owner clears the name or sends one too long, then it's cleared or cut at 40 characters", async () => {
    // Given
    const { connections, rename } = renameSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u1" }).named("Old name").build());

    // When
    const cleared = await rename.execute({ userId: "u1", connectionId: "c1", nickname: "   " });
    const long = await rename.execute({ userId: "u1", connectionId: "c1", nickname: "n".repeat(60) });
    const absent = await rename.execute({ userId: "u1", connectionId: "c1", nickname: undefined });

    // Then
    expect(cleared.nickname).toBeNull();
    expect(long.nickname).toBe("n".repeat(40));
    // A request without a name clears it, like an empty one: the connector's label shows again.
    expect(absent.nickname).toBeNull();
  });

  test("given something that isn't a name, when sent, then it's refused and the connection is unchanged", async () => {
    // Given
    const { connections, rename } = renameSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u1" }).named("Kept").build());

    // When
    const attempt = rename.execute({ userId: "u1", connectionId: "c1", nickname: { name: "x" } });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect((await connections.byId("c1"))!.nickname).toBe("Kept");
  });

  test("given someone else's connection, when a user renames it, then it's refused and its name is kept", async () => {
    // Given
    const { connections, rename } = renameSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u2" }).named("Theirs").build());

    // When
    const attempt = rename.execute({ userId: "u1", connectionId: "c1", nickname: "Mine now" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "forbidden" });
    expect((await connections.byId("c1"))!.nickname).toBe("Theirs");
  });

  test("given a connection that doesn't exist, when renamed, then the owner is told it's not there", async () => {
    // Given
    const { rename } = renameSetup();

    // When
    const attempt = rename.execute({ userId: "u1", connectionId: "missing", nickname: "Anything" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("RemoveConnection", () => {
  function removeSetup() {
    const connections = new InMemoryConnections();
    const { catalog, upstream } = testCatalog();
    const logs: string[] = [];
    const remove = new RemoveConnection({ connections, catalog, secrets: new TransparentSecretBox(), runtime: new FakeRuntime(), clock: new FixedClock(), log: (m) => logs.push(m) });
    return { connections, upstream, logs, remove };
  }

  test("given a connection its provider bills or keeps tokens for, when the owner removes it, then the provider is told first with its credentials", async () => {
    // Given
    const { connections, upstream, remove } = removeSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u1" }).forConnector("social").sealed('sealed:{"access":"a1","refresh":"r1"}').build());

    // When
    await remove.execute({ userId: "u1", connectionId: "c1" });

    // Then
    expect(upstream.disconnected).toEqual([{ access: "a1", refresh: "r1" }]);
    expect(connections.items.has("c1")).toBe(false);
  });

  test("given a provider that's down, when the owner removes the connection, then it's still removed and the failure is logged", async () => {
    // Given
    const { connections, upstream, logs, remove } = removeSetup();
    upstream.disconnectMode = "fail";
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u1" }).forConnector("social").sealed('sealed:{"access":"a1"}').build());

    // When
    await remove.execute({ userId: "u1", connectionId: "c1" });

    // Then
    expect(connections.items.has("c1")).toBe(false);
    expect(logs.join()).toContain("provider down");
    expect(logs.join()).not.toContain("a1");
  });

  test("given someone else's connection, when a user removes it, then it's refused and kept", async () => {
    // Given
    const { connections, upstream, remove } = removeSetup();
    await connections.save(aConnection().withId("c1").ownedBy({ id: "u2" }).forConnector("social").build());

    // When
    const attempt = remove.execute({ userId: "u1", connectionId: "c1" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "forbidden" });
    expect(connections.items.has("c1")).toBe(true);
    expect(upstream.disconnected).toEqual([]);
  });
});

describe("Connecting by signing in at a provider", () => {
  async function signInSetup() {
    const users = new InMemoryUsers();
    const connections = new InMemoryConnections();
    const secrets = new TransparentSecretBox();
    const clock = new FixedClock();
    const { catalog } = testCatalog();
    await users.save(aUser().withId("u1").build());
    const deps = { users, connections, catalog, runtime: new FakeRuntime(), secrets, ids: new SequentialIds(), clock, links: new FakeLinks() };
    return { connections, clock, start: new StartConnectionSignIn(deps), finish: new FinishConnectionSignIn(deps) };
  }

  test("given an owner starting a sign-in, when it starts, then they're sent to the provider with a state and the way back stays sealed", async () => {
    // Given
    const { start } = await signInSetup();

    // When
    const { url, pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });

    // Then
    const sent = new URL(url);
    expect(sent.origin).toBe("https://social.test");
    expect(sent.searchParams.get("redirect_uri")).toBe("https://flexwall.test/api/connections/oauth/callback");
    expect(sent.searchParams.get("state")!.length).toBeGreaterThanOrEqual(2);
    expect(url).not.toContain("v1");
    expect(pending).toContain("v1");
  });

  test("given the provider sends the owner back with a code, when the sign-in finishes, then the connection is stored with its expiry", async () => {
    // Given
    const { start, finish, connections } = await signInSetup();
    const { url, pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });
    const state = new URL(url).searchParams.get("state")!;

    // When
    const { connection, returnTo } = await finish.execute({ userId: "u1", pending, query: { code: "good", state } });

    // Then
    expect(returnTo).toBe("/edit");
    expect(connection).toMatchObject({ connector: "social", label: "@ada", public: { handle: "ada" } });
    const stored = (await connections.byId(connection.id))!;
    expect(stored.expiresAt).toBe(SOCIAL_TOKEN_EXPIRY);
    expect(stored.sealed).toContain("a1");
  });

  test("given an account the owner named, when they sign in at the provider again, then it keeps its name", async () => {
    // Given
    const { start, finish, connections } = await signInSetup();
    const signIn = async () => {
      const { url, pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });
      return finish.execute({ userId: "u1", pending, query: { code: "good", state: new URL(url).searchParams.get("state")! } });
    };
    const first = await signIn();
    await connections.save({ ...(await connections.byId(first.connection.id))!, nickname: "Personal" });

    // When
    const again = await signIn();

    // Then
    expect(again.connection).toMatchObject({ id: first.connection.id, nickname: "Personal" });
    expect(connections.items.size).toBe(1);
  });

  test("given a callback whose state doesn't match, when it finishes, then nothing is stored", async () => {
    // Given
    const { start, finish, connections } = await signInSetup();
    const { pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });

    // When
    const attempt = finish.execute({ userId: "u1", pending, query: { code: "good", state: "forged" } });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect(connections.items.size).toBe(0);
  });

  test("given a sign-in started by someone else or too long ago, when it finishes, then it's refused", async () => {
    // Given
    const { start, finish, clock } = await signInSetup();
    const { url, pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });
    const state = new URL(url).searchParams.get("state")!;

    // When
    const stranger = finish.execute({ userId: "u2", pending, query: { code: "good", state } });
    clock.advance(OAUTH_PENDING_TTL_MS + 1);
    const late = finish.execute({ userId: "u1", pending, query: { code: "good", state } });

    // Then
    await expect(stranger).rejects.toMatchObject({ code: "forbidden" });
    await expect(late).rejects.toMatchObject({ code: "invalid_input", message: "This sign-in expired. Start connecting again." });
  });

  test("given the owner declined at the provider, when the sign-in finishes, then the connector's sentence is shown", async () => {
    // Given
    const { start, finish } = await signInSetup();
    const { url, pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "/edit", fallbackReturn: "/settings" });
    const state = new URL(url).searchParams.get("state")!;

    // When
    const attempt = finish.execute({ userId: "u1", pending, query: { error: "access_denied", state } });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "connection_failed", message: "You declined to connect Social." });
  });

  test("given a return address off the site, when a sign-in starts, then the owner will come back to the fallback page", async () => {
    // Given
    const { start, finish } = await signInSetup();

    // When
    const { pending } = await start.execute({ userId: "u1", connector: "social", values: {}, returnTo: "//evil.example/steal", fallbackReturn: "/settings" });

    // Then
    expect(finish.returnPathOf(pending, "/settings")).toBe("/settings");
  });

  test("given a connector that takes a key, when a sign-in is started for it, then it's refused", async () => {
    // Given
    const { start } = await signInSetup();

    // When
    const attempt = start.execute({ userId: "u1", connector: "billing", values: { key: "key_x" }, returnTo: "/edit", fallbackReturn: "/settings" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
  });
});
