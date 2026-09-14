import { describe, expect, test } from "bun:test";
import { Handle } from "@/domain/handle";
import { firstFreeSpot, mobileLayout, packInto } from "@/domain/layout";
import { entitlementsOf, PAST_DUE_GRACE_MS } from "@/domain/user";
import { effectiveTheme } from "@/domain/wall";
import { aTile, aUser, NOW } from "../builders";
import { testCatalog } from "../fakes/test-plugin";

describe("Handle", () => {
  test("given mixed case and an @, when parsed, then it's normalized", () => {
    // Given
    const raw = " @Ada_Lovelace ";

    // When
    const handle = Handle.parse(raw);

    // Then
    expect(handle).toBe("ada_lovelace" as Handle);
  });

  test("given words the site needs, when parsed, then they're reserved", () => {
    // Given / When / Then
    for (const word of ["api", "explore", "flexwall", "settings", "stripe"]) expect(() => Handle.parse(word)).toThrow("reserved");
  });
});

describe("Entitlements", () => {
  test("given a subscription past due, when within the grace period, then Pro stays on; after it, it's off", () => {
    // Given
    const pastDue = aUser().pro({ status: "past_due", currentPeriodEnd: NOW }).build();

    // When
    const during = entitlementsOf(pastDue, NOW + PAST_DUE_GRACE_MS - 1);
    const after = entitlementsOf(pastDue, NOW + PAST_DUE_GRACE_MS + 1);

    // Then
    expect(during.paid).toBe(true);
    expect(after.paid).toBe(false);
  });

  test("given a free user, when entitlements are read, then the lock screen is watermarked and Pro themes fall back", () => {
    // Given
    const { catalog } = testCatalog();
    const free = entitlementsOf(aUser().build(), NOW);

    // When
    const theme = effectiveTheme({ theme: "terminal" }, catalog, free);

    // Then
    expect(free.watermark).toBe(true);
    expect(theme.id).toBe("night");
  });
});

describe("Mobile layout", () => {
  test("given a desktop row of a wide tile and two small ones, when derived for mobile, then reading order is kept in two columns", () => {
    // Given
    const tiles = [aTile().withId("wide").at(0, 0, 4, 1).build(), aTile().withId("b").at(0, 1, 1, 1).build(), aTile().withId("a").at(1, 1, 1, 1).build()];

    // When
    const layout = mobileLayout(tiles);

    // Then
    expect(layout.map(({ item, box }) => [item.id, box])).toEqual([
      ["wide", { x: 0, y: 0, w: 2, h: 1 }],
      ["b", { x: 0, y: 1, w: 1, h: 1 }],
      ["a", { x: 1, y: 1, w: 1, h: 1 }],
    ]);
  });

  test("given a full first row, when looking for space, then the next row is used", () => {
    // Given
    const placed = [{ x: 0, y: 0, w: 4, h: 1 }];

    // When
    const spot = firstFreeSpot(placed, 2, 1, 4);

    // Then
    expect(spot).toEqual({ x: 0, y: 1, w: 2, h: 1 });
  });

  test("given tiles spread over many rows, when packed for a share card, then two rows fill in reading order and the rest is left out", () => {
    // Given
    const tiles = [
      aTile().withId("tall").at(0, 1, 1, 3).build(),
      aTile().withId("first").at(0, 0, 4, 1).build(),
      aTile().withId("wide").at(1, 1, 3, 1).build(),
      aTile().withId("late").at(0, 9, 4, 1).build(),
    ];

    // When
    const packed = packInto(tiles, 4, 2);

    // Then
    expect(packed.map(({ item, box }) => [item.id, box])).toEqual([
      ["first", { x: 0, y: 0, w: 4, h: 1 }],
      ["tall", { x: 0, y: 1, w: 1, h: 1 }],
      ["wide", { x: 1, y: 1, w: 3, h: 1 }],
    ]);
  });
});
