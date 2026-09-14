import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { currentStreak, parseContributions, shiftDate } from "@/lib/sources/github";
import { heatmapColumns } from "@/lib/render";

const html = readFileSync("tests/fixtures/github-contributions.html", "utf8");

describe("github contributions", () => {
  test("parses a year of days from the real calendar fragment", () => {
    const days = parseContributions(html);
    expect(days.length).toBeGreaterThan(360);
    expect(days[0].date < days.at(-1)!.date).toBe(true);
    expect(days.some((d) => d.count > 1)).toBe(true);
    expect(days.every((d) => d.level >= 0 && d.level <= 4)).toBe(true);
    // Level 0 days are exactly the zero-count days.
    expect(days.filter((d) => d.level === 0).every((d) => d.count === 0)).toBe(true);
  });

  test("streak tolerates an empty today but not an empty yesterday", () => {
    const days = [
      { date: "2026-09-10", count: 2, level: 1 },
      { date: "2026-09-11", count: 0, level: 0 },
      { date: "2026-09-12", count: 1, level: 1 },
      { date: "2026-09-13", count: 4, level: 2 },
      { date: "2026-09-14", count: 0, level: 0 },
    ];
    expect(currentStreak(days, "2026-09-14")).toBe(2);
    expect(currentStreak(days, "2026-09-13")).toBe(2);
    expect(currentStreak(days, "2026-09-15")).toBe(0);
  });

  test("shiftDate crosses months and years", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("heatmap columns are full weeks starting on Sunday", () => {
    const cols = heatmapColumns(parseContributions(html), 26);
    expect(cols.length).toBe(26);
    for (const col of cols.slice(0, -1)) expect(col.length).toBe(7);
    const first = cols[1].find(Boolean)!;
    expect(new Date(first.date + "T00:00:00Z").getUTCDay()).toBe(0);
  });
});
