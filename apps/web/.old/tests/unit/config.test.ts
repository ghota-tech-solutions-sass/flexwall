import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, decodeConfig, encodeConfig, parseConfig } from "@/lib/config";

describe("config", () => {
  test("defaults fill a minimal config", () => {
    const c = parseConfig({ hero: { kind: "year-progress" } });
    expect(c).not.toBeNull();
    expect(c!.theme).toBe("ink");
    expect(c!.device).toBe("iphone-17-pro");
    expect(c!.stats).toEqual([]);
    expect(c!.tz).toBe("UTC");
  });

  test("rejects bad input", () => {
    expect(parseConfig({ hero: { kind: "github-streak", user: "bad user!" } })).toBeNull();
    expect(parseConfig({ hero: { kind: "countdown", label: "x", date: "14/10/2026" } })).toBeNull();
    expect(parseConfig({ hero: { kind: "goal", label: "x", current: 1, target: 0 } })).toBeNull();
    expect(parseConfig({ hero: { kind: "year-progress" }, tz: "Mars/Olympus" })).toBeNull();
    expect(parseConfig({ hero: { kind: "year-progress" }, stats: Array(4).fill({ kind: "year-progress" }) })).toBeNull();
    expect(parseConfig({ hero: { kind: "year-progress" }, theme: "neon" })).toBeNull();
  });

  test("encode/decode round-trips, including non-ASCII", () => {
    const c = { ...DEFAULT_CONFIG, caption: "été · 1er objectif €" };
    expect(decodeConfig(encodeConfig(c))).toEqual(c);
  });

  test("decode refuses garbage and oversized input", () => {
    expect(decodeConfig("not-base64-json")).toBeNull();
    expect(decodeConfig("a".repeat(5000))).toBeNull();
  });
});
