import { describe, expect, test } from "bun:test";
import { formatHandle, stripHandlePrefix } from "@/domain/handle";
import { isoDay, shiftDay, startOfDay } from "@/domain/time";

describe("Days and handles as people read them", () => {
  test("given a day, when taken to its first instant and back, then it's the same day in UTC", () => {
    // Given
    const day = "2026-09-14";

    // When
    const start = startOfDay(day);

    // Then
    expect(start.getTime()).toBe(Date.UTC(2026, 8, 14));
    expect(isoDay(start)).toBe(day);
    expect(shiftDay(day, 20)).toBe("2026-10-04");
  });

  test("given a handle with or without its sign, when written and read back, then the sign appears once", () => {
    // Given / When / Then
    expect(formatHandle("ada")).toBe("@ada");
    expect(stripHandlePrefix("@ada")).toBe("ada");
    expect(stripHandlePrefix("ada")).toBe("ada");
  });
});
