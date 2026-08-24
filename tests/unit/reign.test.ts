import { describe, expect, test } from "bun:test";
import { computeReign, reignDuration, timeAgo } from "../../src/lib/reign";
import type { WallEvent } from "../../src/lib/store/entries";

const ev = (slug: string, newTotalUSD: number, ts: number): WallEvent =>
  ({ id: slug + ts, type: "entry", slug, name: slug, amountUSD: 0, newTotalUSD, ts });

describe("computeReign", () => {
  const events = [ev("a", 100, 1), ev("b", 200, 2), ev("a", 300, 3), ev("c", 250, 4), ev("b", 260, 5)];
  test("finds when the leader took over and counts challenges", () => {
    expect(computeReign(events, "a", 0)).toEqual({ since: 3, challenges: 2 });
  });
  test("ties keep the earlier leader", () => {
    expect(computeReign([...events, ev("b", 300, 6)], "a", 0)).toEqual({ since: 3, challenges: 3 });
  });
  test("empty journal falls back to createdAt", () => {
    expect(computeReign([], "a", 42)).toEqual({ since: 42, challenges: 0 });
  });
});

describe("durations", () => {
  test("reignDuration", () => {
    const now = 100 * 3_600_000;
    expect(reignDuration(now - 30 * 60_000, now)).toBe("under an hour");
    expect(reignDuration(now - 5 * 3_600_000, now)).toBe("5 hours");
    expect(reignDuration(now - 72 * 3_600_000, now)).toBe("3 days");
  });
  test("timeAgo", () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 min ago");
  });
});
