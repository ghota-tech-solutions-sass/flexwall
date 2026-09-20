import { describe, expect, test } from "bun:test";
import { CheckHandle, ClaimHandle } from "@/application/use-cases/claim-handle";
import { Handle } from "@/domain/handle";
import { DomainError } from "@/domain/errors";
import { aUser } from "../builders";
import { FixedClock, InMemoryHandles, InMemoryUsers, InMemoryWalls, SequentialIds } from "../fakes";

function setup() {
  const users = new InMemoryUsers();
  const handles = new InMemoryHandles();
  const walls = new InMemoryWalls();
  const claimHandle = new ClaimHandle({ users, handles, walls, ids: new SequentialIds(), clock: new FixedClock() });
  return { users, handles, walls, claimHandle };
}

describe("ClaimHandle", () => {
  test("given a signed-in user without a handle, when they claim a free one, then it's theirs with a private starter wall", async () => {
    // Given
    const { users, handles, walls, claimHandle } = setup();
    const user = aUser().withId("u1").withHandle(null).build();
    await users.save(user);

    // When
    const wall = await claimHandle.execute({ userId: "u1", handle: "@Ada Builds" });

    // Then
    expect(wall.handle).toBe("ada-builds" as never);
    expect(wall.ownerId).toBe("u1");
    expect(wall.published).toBe(false);
    // Everything on it is public and says something true: a private zero reads as a broken tile.
    expect(wall.tiles.map((t) => t.widget)).toEqual(["note", "time-left", "countdown"]);
    expect(wall.tiles.every((t) => t.visibility === "public")).toBe(true);
    expect(wall.tiles.some((t) => String(t.options.body ?? "").toLowerCase().includes("drag"))).toBe(false);
    // The lock screen places a tile by name: it must still be on the wall.
    expect(wall.tiles.map((t) => t.id)).toContain(wall.lockscreen.placements[0].tileId);
    expect((await users.byId("u1"))!.handle).toBe("ada-builds" as never);
    expect(await handles.ownerOf("ada-builds" as never)).toBe("u1");
    expect(await walls.byOwner("u1")).not.toBeNull();
  });

  test("given a handle someone owns, when another user claims it, then they're told it's taken", async () => {
    // Given
    const { users, claimHandle } = setup();
    await users.save(aUser().withId("u1").withHandle(null).build());
    await users.save(aUser().withId("u2").withEmail("grace@example.com").withHandle(null).build());
    await claimHandle.execute({ userId: "u1", handle: "ada" });

    // When
    const attempt = claimHandle.execute({ userId: "u2", handle: "ADA" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "handle_taken" });
  });

  test("given a reserved or malformed handle, when a user claims it, then nothing is written", async () => {
    // Given
    const { users, handles, claimHandle } = setup();
    await users.save(aUser().withId("u1").withHandle(null).build());

    // When
    const reserved = claimHandle.execute({ userId: "u1", handle: "admin" }).catch((e: DomainError) => e.code);
    const malformed = claimHandle.execute({ userId: "u1", handle: "!!" }).catch((e: DomainError) => e.code);

    // Then
    expect(await reserved).toBe("handle_reserved");
    expect(await malformed).toBe("invalid_handle");
    expect(handles.items.size).toBe(0);
  });

  test("given a user who already has a handle, when they claim another, then it's refused", async () => {
    // Given
    const { users, claimHandle } = setup();
    await users.save(aUser().withId("u1").withHandle("ada").build());

    // When
    const attempt = claimHandle.execute({ userId: "u1", handle: "lovelace" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "handle_already_set" });
  });
});


describe("CheckHandle", () => {
  test("checking availability doesn't reserve a name and includes unpublished owners", async () => {
    const { users, handles, claimHandle } = setup();
    const check = new CheckHandle(handles);
    expect(await check.execute("Ada")).toEqual({ handle: Handle.parse("ada"), available: true });
    expect(handles.items.size).toBe(0);
    await users.save(aUser().withId("u1").withHandle(null).build());
    const wall = await claimHandle.execute({ userId: "u1", handle: "ada" });
    expect(wall.published).toBe(false);
    expect(await check.execute("ada")).toEqual({ handle: Handle.parse("ada"), available: false });
  });
  test("reserved and invalid handles are never available", async () => {
    const check = new CheckHandle(new InMemoryHandles());
    await expect(check.execute("admin")).rejects.toMatchObject({ code: "handle_reserved" });
    await expect(check.execute("a")).rejects.toMatchObject({ code: "invalid_handle" });
  });
});
