import { describe, expect, test } from "bun:test";
import { callbackQuery, needsRenewal, RENEW_BEFORE_EXPIRY_MS, safeReturnPath } from "@/domain/connection";
import { Handle } from "@/domain/handle";
import { todayIn } from "@/domain/time";
import { firstFreeSpot, makeRoom, mobileLayout, packInto } from "@/domain/layout";
import { entitlementsOf, PAST_DUE_GRACE_MS } from "@/domain/user";
import { effectiveTheme } from "@/domain/wall";
import { aTile, aUser, NOW } from "../builders";
import { testCatalog } from "../fakes/test-plugin";
import { packInOrder, phoneSizeBounds, readingOrder, WALL_COLUMNS, wallBoxFromPhone, type Box } from "@/domain/layout";

describe("Handle", () => {
  test("given mixed case, an @, spaces and underscores, when parsed, then it becomes a hyphenated slug", () => {
    // Given
    const raw = " @Ada_Lovelace  Builds ";

    // When
    const handle = Handle.parse(raw);

    // Then
    expect(handle).toBe("ada-lovelace-builds" as Handle);
  });

  test("given accents and punctuation, when slugified, then accents are dropped and the rest joins with single hyphens", () => {
    // Given
    const raw = "Élodie & Co.!!";

    // When
    const slug = Handle.slugify(raw);

    // Then
    expect(slug).toBe("elodie-co-");
    expect(Handle.parse(raw)).toBe("elodie-co" as Handle);
  });

  test("given someone typing a second word, when the field is slugified, then the trailing hyphen stays so they can keep typing", () => {
    // Given
    const typing = "ghota ";

    // When
    const slug = Handle.slugify(typing);

    // Then
    expect(slug).toBe("ghota-");
  });

  test("given a name longer than the limit, when slugified, then it's cut to the limit", () => {
    // Given
    const raw = "a".repeat(40);

    // When
    const slug = Handle.slugify(raw);

    // Then
    expect(slug.length).toBe(30);
    expect(Handle.isValid(raw)).toBe(true);
  });

  test("given nothing usable, when parsed, then it's refused with the rule", () => {
    // Given / When / Then
    for (const raw of ["", "!!", "a", "-"]) expect(() => Handle.parse(raw)).toThrow("letters, digits and hyphens");
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

describe("Today in a time zone", () => {
  test("given an instant just after midnight in Paris, when today is read there and in UTC, then each gets its own ISO date", () => {
    // Given
    const instant = Date.UTC(2026, 8, 14, 22, 30, 0);

    // When
    const paris = todayIn("Europe/Paris", instant);
    const utc = todayIn("UTC", instant);

    // Then
    expect(paris).toBe("2026-09-15");
    expect(utc).toBe("2026-09-14");
  });

  test("given an unknown time zone, when today is read, then it falls back to the UTC date", () => {
    // Given / When / Then
    expect(todayIn("Mars/Olympus", Date.UTC(2026, 0, 2, 3))).toBe("2026-01-02");
  });
});

describe("Connections that expire", () => {
  test("given return addresses, when made safe, then only paths on this site survive", () => {
    // Given / When / Then
    expect(safeReturnPath("/edit", "/settings")).toBe("/edit");
    expect(safeReturnPath("/settings?tab=1", "/settings")).toBe("/settings?tab=1");
    expect(safeReturnPath("https://evil.example", "/settings")).toBe("/settings");
    expect(safeReturnPath("//evil.example", "/settings")).toBe("/settings");
    expect(safeReturnPath("/\\evil.example", "/settings")).toBe("/settings");
    expect(safeReturnPath(undefined, "/settings")).toBe("/settings");
  });

  test("given a provider that appends its parameters with a second question mark, when the callback is read, then state and its parameters come apart", () => {
    // Given
    const glued = new URLSearchParams("state=abc?status=SUCCESS&connection_id=42");
    const clean = new URLSearchParams("state=abc&status=SUCCESS");

    // When / Then
    expect(callbackQuery(glued.entries())).toEqual({ state: "abc", status: "SUCCESS", connection_id: "42" });
    expect(callbackQuery(clean.entries())).toEqual({ state: "abc", status: "SUCCESS" });
  });

  test("given credentials with and without an expiry, when checked, then renewal starts a few minutes before they lapse", () => {
    // Given
    const expiresAt = Date.UTC(2026, 8, 15, 12, 0, 0);

    // When / Then
    expect(needsRenewal({ expiresAt }, expiresAt - RENEW_BEFORE_EXPIRY_MS - 1)).toBe(false);
    expect(needsRenewal({ expiresAt }, expiresAt - RENEW_BEFORE_EXPIRY_MS)).toBe(true);
    expect(needsRenewal({ expiresAt: null }, expiresAt)).toBe(false);
    expect(needsRenewal({}, expiresAt)).toBe(false);
  });
});

describe("Dropping a tile on a wall", () => {
  test("given tiles under the spot a tile is dropped on, when room is made, then they move down below it, and those they land on move too", () => {
    // Given
    const dropped = { x: 0, y: 0, w: 2, h: 1 };
    const others = [
      { i: "wide", x: 0, y: 0, w: 4, h: 1 },
      { i: "under", x: 1, y: 1, w: 1, h: 1 },
      { i: "aside", x: 3, y: 2, w: 1, h: 1 },
    ];

    // When
    const moved = makeRoom(dropped, others);

    // Then
    expect(moved).toEqual([
      { i: "wide", x: 0, y: 1, w: 4, h: 1 },
      { i: "under", x: 1, y: 2, w: 1, h: 1 },
      { i: "aside", x: 3, y: 2, w: 1, h: 1 },
    ]);
  });
});


describe("Arranging a wall from a phone", () => {
  const tile = (id: string, box: Box) => ({ id, layout: box });

  test("given tiles in an order, when they're packed for the wall, then reading them back gives that order", () => {
    // Given: widths that make a plain packer fill the hole behind the first tile
    const ordered = [tile("a", { x: 0, y: 0, w: 3, h: 1 }), tile("b", { x: 0, y: 0, w: 2, h: 1 }), tile("c", { x: 0, y: 0, w: 1, h: 1 })];

    // When
    const packed = packInOrder(ordered, WALL_COLUMNS);

    // Then
    expect(readingOrder(packed.map((p) => ({ id: p.item.id, layout: p.box }))).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  test("given an arrangement made on a phone, when it's stored and projected back, then the order and the sizes come back the same", () => {
    // Given
    const onPhone = [tile("note", { x: 0, y: 0, w: 2, h: 1 }), tile("small", { x: 0, y: 1, w: 1, h: 1 }), tile("tall", { x: 1, y: 1, w: 1, h: 2 })];

    // When
    const stored = packInOrder(
      onPhone.map((t) => ({ ...t, layout: wallBoxFromPhone(t.layout, { w: t.layout.w, h: t.layout.h }) })),
      WALL_COLUMNS
    ).map((p) => ({ id: p.item.id, layout: p.box }));
    const projected = mobileLayout(stored);

    // Then
    expect(projected.map((p) => p.item.id)).toEqual(["note", "small", "tall"]);
    expect(projected.map((p) => [p.box.w, p.box.h])).toEqual([
      [2, 1],
      [1, 1],
      [1, 2],
    ]);
  });

  test("given a tile that was full width on the wall, when it stays full width on the phone, then it keeps all four columns", () => {
    // Given
    const wide = { x: 0, y: 0, w: 4, h: 2 };
    const half = { x: 0, y: 0, w: 2, h: 1 };

    // When
    const back = [wallBoxFromPhone(wide, { w: 2, h: 2 }), wallBoxFromPhone(half, { w: 2, h: 1 }), wallBoxFromPhone(half, { w: 1, h: 1 })];

    // Then
    expect(back.map((b) => b.w)).toEqual([4, 2, 1]);
  });

  test("given what a widget allows on the wall, when its phone bounds are read, then widths become classes, not halves", () => {
    // Given
    const link = { min: [1, 1] as const, max: [2, 2] as const };
    const heatmap = { min: [2, 1] as const, max: [4, 2] as const };

    // When
    const bounds = [phoneSizeBounds(link), phoneSizeBounds(heatmap)];

    // Then
    expect(bounds).toEqual([
      { minW: 1, maxW: 2, minH: 1, maxH: 2 },
      { minW: 2, maxW: 2, minH: 1, maxH: 2 },
    ]);
  });
});
