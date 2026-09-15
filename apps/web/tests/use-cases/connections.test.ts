import { describe, expect, test } from "bun:test";
import { ConnectAccount, FinishConnectionSignIn, RemoveConnection, StartConnectionSignIn } from "@/application/use-cases/connections";
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
