import { describe, expect, test } from "bun:test";
import { bandFloor, formatBand, showsRange } from "../src/format";

describe("Ranges for sensitive amounts", () => {
  test("given amounts across magnitudes, when banded, then only the number of figures is kept", () => {
    // Given / When / Then
    expect(bandFloor(3_480_000)).toBe(1_000_000);
    expect(bandFloor(10_000_000)).toBe(10_000_000);
    expect(bandFloor(999)).toBe(0);
    expect(bandFloor(42, 1)).toBe(10);
    expect(bandFloor(Number.NaN)).toBe(0);
  });

  test("given balances in different currencies, when printed as ranges, then they read like $1M+ and never show the amount", () => {
    // Given / When / Then
    expect(formatBand({ value: 2_431_900, unit: "currency", currency: "usd" })).toBe("$1M+");
    expect(formatBand({ value: 48_210, unit: "currency", currency: "eur" })).toBe("€10k+");
    expect(formatBand({ value: 1_500, unit: "currency", currency: "usd" })).toBe("$1k+");
    expect(formatBand({ value: 640, unit: "currency", currency: "gbp" })).toBe("under £1k");
    expect(formatBand({ value: 250_000 })).toBe("100k+");
    expect(formatBand({ value: 12.4 })).toBe("10+");
    expect(formatBand({ value: 0.35 })).toBe("under 1");
  });

  test("given a tile's display choice, when deciding, then auto follows the metric and explicit choices win", () => {
    // Given / When / Then
    expect(showsRange("auto", true)).toBe(true);
    expect(showsRange(undefined, true)).toBe(true);
    expect(showsRange("auto", false)).toBe(false);
    expect(showsRange("exact", true)).toBe(false);
    expect(showsRange("range", undefined)).toBe(true);
  });
});
