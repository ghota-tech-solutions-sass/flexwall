import { describe, expect, test } from "bun:test";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { joinedLabel, monogram, postOnX, verifiedCount, wallIdentity } from "@/presentation/wall/profile";

describe("A public wall's profile", () => {
  test("given a wall still titled with its handle, when named, then the handle is shown once", () => {
    // Given / When / Then
    expect(wallIdentity("@ada", "ada")).toEqual({ name: "@ada", showHandle: false });
    expect(wallIdentity("ada", "ada")).toEqual({ name: "@ada", showHandle: false });
    expect(wallIdentity("Ada", "ada")).toEqual({ name: "Ada", showHandle: true });
    expect(wallIdentity("   ", "ada")).toEqual({ name: "@ada", showHandle: false });
    expect(wallIdentity(" Ada Builds ", "ada")).toEqual({ name: "Ada Builds", showHandle: true });
  });

  test("given a title or only a handle, when the avatar letter is picked, then it skips the at sign", () => {
    // Given / When / Then
    expect(monogram("maya Levin", "maya")).toBe("M");
    expect(monogram("", "théo")).toBe("T");
    expect(monogram("@ines", "ines")).toBe("I");
  });

  test("given when a wall was created, when printed, then it reads as a month and a year", () => {
    // Given / When / Then
    expect(joinedLabel(Date.UTC(2026, 8, 14))).toBe("Joined September 2026");
  });

  test("given resolved tiles, when counted, then only ready tiles with a verified source count", () => {
    // Given
    const states = {
      mrr: { status: "ready", inputs: { value: { type: "number", value: 4820, source: { name: "Stripe", verified: true } } } },
      goal: { status: "ready", inputs: { value: { type: "number", value: 70 } } },
      stars: { status: "placeholder", reason: "connect", message: "Connect GitHub" },
    } as unknown as Record<string, TileState>;

    // When
    const count = verifiedCount(states);

    // Then
    expect(count).toBe(1);
  });

  test("given a wall address, when shared on X, then the post carries the text and the link", () => {
    // Given / When
    const href = new URL(postOnX("https://flexwall.lol/@ada", "Ada on Flexwall"));

    // Then
    expect(href.origin + href.pathname).toBe("https://x.com/intent/post");
    expect(href.searchParams.get("url")).toBe("https://flexwall.lol/@ada");
    expect(href.searchParams.get("text")).toBe("Ada on Flexwall");
  });
});
