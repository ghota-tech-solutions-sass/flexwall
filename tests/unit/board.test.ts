import { describe, expect, test } from "bun:test";
import { compactUSD, dynamicFloor, founderSlugs, makeIdentity, nextFloorTier, rankEntries, type Entry } from "../../src/lib/board";

const e = (slug: string, amountUSD: number, createdAt: number): Entry =>
  ({ slug, name: slug, amountUSD, verified: false, createdAt, updatedAt: createdAt });

describe("makeIdentity", () => {
  test("same wall for @handle, handle, HANDLE", () => {
    for (const raw of ["@Elonmusk", "elonmusk", "ELONMUSK"]) {
      expect(makeIdentity(raw)?.slug).toBe("elonmusk");
    }
  });
  test("strips accents and punctuation", () => {
    expect(makeIdentity("VILLERS Mickaël")?.slug).toBe("villers_mickael");
    expect(makeIdentity("crypto.karen")?.slug).toBe("crypto_karen");
  });
  test("rejects garbage", () => {
    expect(makeIdentity("!")).toBeNull();
    expect(makeIdentity("  ")).toBeNull();
    expect(makeIdentity("___")).toBeNull();
  });
  test("keeps display name as typed (trimmed)", () => {
    expect(makeIdentity("  Trust  Fund Tom ")?.name).toBe("Trust Fund Tom");
  });
});

describe("floor", () => {
  test("rises with wall size", () => {
    expect(dynamicFloor(0)).toBe(100);
    expect(dynamicFloor(24)).toBe(100);
    expect(dynamicFloor(25)).toBe(250);
    expect(dynamicFloor(50)).toBe(500);
    expect(dynamicFloor(100)).toBe(1000);
    expect(dynamicFloor(5000)).toBe(1000);
  });
  test("next tier", () => {
    expect(nextFloorTier(0)?.at).toBe(25);
    expect(nextFloorTier(100)).toBeNull();
  });
});

describe("ranking", () => {
  test("amount desc, ties to earliest", () => {
    const ranked = rankEntries([e("late", 100, 2), e("early", 100, 1), e("big", 500, 3)]);
    expect(ranked.map((x) => x.slug)).toEqual(["big", "early", "late"]);
  });
  test("founder stars go to the 100 earliest", () => {
    const entries = Array.from({ length: 120 }, (_, i) => e("s" + i, 100, i));
    const f = founderSlugs(entries);
    expect(f.size).toBe(100);
    expect(f.has("s0")).toBe(true);
    expect(f.has("s119")).toBe(false);
  });
});

describe("compactUSD", () => {
  test("formats", () => {
    expect(compactUSD(950)).toBe("$950");
    expect(compactUSD(14_200_000)).toBe("$14.2M");
    expect(compactUSD(52_000)).toBe("$52k");
  });
});
