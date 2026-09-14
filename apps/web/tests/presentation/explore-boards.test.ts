import { describe, expect, test } from "bun:test";
import { boardValue, exploreSort, leaderboardOf, updatedAgo } from "@/presentation/explore/boards";

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

describe("The Wall's leaderboards", () => {
  test("given values on each board, when printed, then revenue is in compact dollars, wealth in ranges and streaks in days", () => {
    // Given / When / Then
    expect(boardValue("revenue", 4820)).toBe("$4,820");
    expect(boardValue("revenue", 12400)).toBe("$12.4k");
    expect(boardValue("streak", 1)).toBe("1 day");
    expect(boardValue("streak", 412)).toBe("412 days");
    expect(boardValue("stars", 8912)).toBe("8,912");
    expect(boardValue("wealth", 2_400_000)).toBe("$1M+");
  });

  test("given a sort from the address bar, when it isn't a known board, then the wall falls back to recent", () => {
    // Given / When / Then
    expect(exploreSort("revenue")).toBe("revenue");
    expect(exploreSort("drop table")).toBe("recent");
    expect(exploreSort(undefined)).toBe("recent");
  });

  test("given walls updated at different times, when described, then the unit grows with the gap and old ones show a date", () => {
    // Given / When / Then
    expect(updatedAgo(NOW - 20_000, NOW)).toBe("just now");
    expect(updatedAgo(NOW - 12 * 60_000, NOW)).toBe("12 min ago");
    expect(updatedAgo(NOW - 3 * 3_600_000, NOW)).toBe("3 h ago");
    expect(updatedAgo(NOW - 5 * 86_400_000, NOW)).toBe("5 d ago");
    expect(updatedAgo(Date.UTC(2026, 6, 3), NOW)).toBe("Jul 3");
  });

  test("given a sort, when its leaderboard is asked for, then the recent list has none", () => {
    // Given / When / Then
    expect(leaderboardOf("recent")).toBeNull();
    expect(leaderboardOf("stars")).toBe("stars");
  });
});
