import { describe, expect, test } from "bun:test";
import { number, parseTypedNumber, text } from "@flexwall/sdk";
import { shortcutFor } from "@/presentation/editor/shortcuts";
import { tileStatus } from "@/presentation/editor/tile-status";

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe("Editor status line", () => {
  test("given each state a tile can be in, when described, then the owner reads what it shows and why", () => {
    // Given
    const states = [
      undefined,
      { status: "placeholder" as const, reason: "connect" as const, message: "Connect Stripe" },
      { status: "ready" as const, inputs: { value: { value: number(4820, { unit: "currency", currency: "usd" }), stale: false, source: { connector: "stripe", name: "Stripe", verified: true } } } },
      { status: "ready" as const, inputs: { value: { value: text("Shipping v2 this week, then the mobile app"), stale: true } } },
    ];

    // When
    const lines = states.map(tileStatus);

    // Then
    expect(lines).toEqual([
      { tone: "wait", label: "Loading the value…", value: null },
      { tone: "action", label: "Waiting for an account", value: null },
      { tone: "ok", label: "Verified by Stripe", value: "$4,820" },
      { tone: "warn", label: "Last known value", value: "Shipping v2 this week…" },
    ]);
  });
});

describe("Editor shortcuts and typed numbers", () => {
  test("given keys pressed in the editor, when matched, then only the intended shortcuts fire", () => {
    // Given
    const events = [key("Backspace"), key("d", { metaKey: true }), key("d"), key("Z", { ctrlKey: true }), key("z", { metaKey: true, shiftKey: true }), key("Escape")];

    // When
    const actions = events.map(shortcutFor);

    // Then
    expect(actions).toEqual(["delete", "duplicate", null, "undo", null, "deselect"]);
  });

  test("given numbers typed with separators, when parsed, then they read as numbers and junk is refused", () => {
    // Given
    const typed = ["1 240", "12,400.5", "", "12k"];

    // When
    const parsed = typed.map(parseTypedNumber);

    // Then
    expect(parsed).toEqual([1240, 12400.5, null, null]);
  });
});
