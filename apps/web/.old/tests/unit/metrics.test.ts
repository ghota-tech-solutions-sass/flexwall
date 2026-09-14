import { describe, expect, test } from "bun:test";
import type { Metric } from "@/lib/config";
import { formatAmount, formatCompact, resolveLocal, resolveWall, todayIn } from "@/lib/metrics";

const at = (m: Exclude<Metric, { kind: "connector" }>, today: string) => Promise.resolve(resolveLocal(m, today));

describe("metrics", () => {
  test("countdown: future, today, past", async () => {
    const m: Metric = { kind: "countdown", label: "until launch", date: "2026-10-01" };
    expect(await at(m, "2026-09-14")).toEqual({ value: "17", label: "days until launch" });
    expect(await at(m, "2026-09-30")).toEqual({ value: "1", label: "day until launch" });
    expect((await at(m, "2026-10-01")).value).toBe("Today");
    expect(await at(m, "2026-10-04")).toEqual({ value: "+3", label: "days past · until launch" });
  });

  test("year progress uses the owner's calendar year", async () => {
    const d = await at({ kind: "year-progress" }, "2026-01-01");
    expect(d.value).toBe("0%");
    expect((await at({ kind: "year-progress" }, "2026-12-31")).value).toBe("100%");
    expect((await at({ kind: "year-progress" }, "2028-12-31")).progress).toBeCloseTo(1); // leap year
  });

  test("goal caps the bar and formats both sides", async () => {
    const d = await at({ kind: "goal", label: "MRR", current: 12400, target: 10000, prefix: "$", suffix: "" }, "2026-09-14");
    expect(d.value).toBe("$12,400");
    expect(d.of).toBe("/ $10k");
    expect(d.progress).toBe(1);
  });

  test("amount formatting", () => {
    expect(formatAmount(1240)).toBe("1,240");
    expect(formatAmount(123456)).toBe("123k");
    expect(formatAmount(2_450_000)).toBe("2.5M");
    expect(formatCompact(10000)).toBe("10k");
    expect(formatCompact(2500)).toBe("2.5k");
  });

  test("today is computed in the owner's zone", () => {
    const lateUtc = new Date("2026-09-14T22:30:00Z");
    expect(todayIn("UTC", lateUtc)).toBe("2026-09-14");
    expect(todayIn("Asia/Tokyo", lateUtc)).toBe("2026-09-15");
    expect(todayIn("America/Los_Angeles", lateUtc)).toBe("2026-09-14");
  });

  test("resolveWall in sample mode never touches the network", async () => {
    const r = await resolveWall({
      config: {
        device: "iphone-17-pro",
        theme: "ink",
        caption: "",
        hero: { kind: "connector", source: "github", field: "streak", params: { user: "x" }, connection: "", label: "streak", prefix: "", suffix: "" },
        stats: [],
        heatmap: "x",
        tz: "UTC",
      },
      mode: "sample",
      now: new Date("2026-09-14T08:00:00Z"),
    });
    expect(r.hero.value).toBe("47");
    expect(r.heatmap!.at(-1)!.date).toBe("2026-09-14");
  });
});
