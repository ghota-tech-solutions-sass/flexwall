import { describe, expect, test } from "bun:test";
import { gridUnits } from "@flexwall/sdk";
import { DEVICES, LOCK_COLUMNS, LOCKSCREEN_BAND, lockscreenGeometry, WATERMARK } from "@/domain/layout";

describe("Lock screen geometry", () => {
  test("given an iPhone 17 Pro at full size, when measured, then the grid spans the margins and hangs from the bottom of the band", () => {
    // Given
    const device = DEVICES["iphone-17-pro"];

    // When
    const g = lockscreenGeometry(device.w, device);

    // Then
    expect(g.height).toBe(device.h);
    expect(g.margin).toBeCloseTo(device.w * LOCKSCREEN_BAND.marginRatio);
    expect(g.gridWidth).toBeCloseTo(gridUnits(LOCK_COLUMNS) * g.scale);
    expect(g.top + g.gridHeight).toBeCloseTo(device.h * LOCKSCREEN_BAND.bottomRatio);
  });

  test("given a short screen, when the grid would climb over the clock, then it stops at the top of the band", () => {
    // Given
    const squat = { w: 1000, h: 1400 };

    // When
    const g = lockscreenGeometry(squat.w, squat);

    // Then
    expect(g.top).toBeCloseTo(squat.h * LOCKSCREEN_BAND.topRatio);
  });

  test("given the editor's small preview and the full image, when both are measured, then every position is the same share of the screen", () => {
    // Given
    const device = DEVICES["iphone-17-pro"];

    // When
    const preview = lockscreenGeometry(316, device);
    const image = lockscreenGeometry(device.w, device);

    // Then
    const shares = (g: typeof image) => [g.top / g.height, g.margin / g.width, g.watermark.bottom / g.height, g.watermark.fontSize / g.width, g.watermark.letterSpacing / g.width];
    shares(preview).forEach((share, i) => expect(share).toBeCloseTo(shares(image)[i]));
    expect(image.watermark.fontSize).toBeCloseTo((WATERMARK.fontSize * device.w) / WATERMARK.referenceWidth);
  });
});
