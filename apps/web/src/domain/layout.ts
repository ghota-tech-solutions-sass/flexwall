/**
 * Grid geometry shared by every surface. Positions and sizes are in cells;
 * renderers turn cells into pixels or CSS.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WALL_COLUMNS = 4;
export const MOBILE_COLUMNS = 2;
/** The lock screen band between the clock and the flashlight/camera buttons fits 4×4 cells on every iPhone. */
export const LOCK_COLUMNS = 4;
export const LOCK_ROWS = 4;

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function fitsColumns(box: Box, columns: number): boolean {
  return Number.isInteger(box.x) && Number.isInteger(box.y) && box.x >= 0 && box.y >= 0 && box.w >= 1 && box.h >= 1 && box.x + box.w <= columns;
}

/** First pair of boxes that overlap, as indexes, or null. */
export function firstOverlap(boxes: readonly Box[]): [number, number] | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) return [i, j];
  }
  return null;
}

/** Rows the layout uses. */
export function heightOf(boxes: readonly Box[]): number {
  return boxes.reduce((h, b) => Math.max(h, b.y + b.h), 0);
}

/**
 * Two-column layout derived from the desktop one: reading order (row, then
 * column), each tile at most 2 wide, packed top-down. Keeps the owner's
 * intent without making them design a second layout.
 */
export function mobileLayout<T extends { layout: Box }>(items: readonly T[]): { item: T; box: Box }[] {
  const ordered = [...items].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const placed: Box[] = [];
  const out: { item: T; box: Box }[] = [];
  for (const item of ordered) {
    const w = Math.min(item.layout.w, MOBILE_COLUMNS);
    const h = item.layout.w > MOBILE_COLUMNS ? Math.max(1, Math.ceil((item.layout.h * item.layout.w) / MOBILE_COLUMNS / 2)) : item.layout.h;
    const box = firstFreeSpot(placed, w, h, MOBILE_COLUMNS);
    placed.push(box);
    out.push({ item, box });
  }
  return out;
}

/**
 * Packs items in reading order into a fixed columns×rows frame, shrinking each
 * to fit and skipping what doesn't. Share cards use it: whatever the wall's
 * layout, the card shows as many tiles as its two rows can hold.
 */
export function packInto<T extends { layout: Box }>(items: readonly T[], columns: number, rows: number): { item: T; box: Box }[] {
  const ordered = [...items].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const placed: Box[] = [];
  const out: { item: T; box: Box }[] = [];
  for (const item of ordered) {
    // Try the tile's height first, then shorter, before giving up on it.
    for (let h = Math.min(item.layout.h, rows); h >= 1; h--) {
      const box = firstFreeSpot(placed, Math.min(item.layout.w, columns), h, columns);
      if (box.y + box.h > rows) continue;
      placed.push(box);
      out.push({ item, box });
      break;
    }
  }
  return out;
}

/** Top-most, then left-most free position for a w×h box. */
export function firstFreeSpot(placed: readonly Box[], w: number, h: number, columns: number): Box {
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= columns; x++) {
      const candidate = { x, y, w, h };
      if (!placed.some((p) => overlaps(p, candidate))) return candidate;
    }
  }
}

/** iPhone lock screens in pixels, newest first. */
export const DEVICES = {
  "iphone-17-pro": { label: "iPhone 17 Pro · 17 · 16 Pro", w: 1206, h: 2622 },
  "iphone-17-pro-max": { label: "iPhone 17 Pro Max · 16 Pro Max", w: 1320, h: 2868 },
  "iphone-air": { label: "iPhone Air", w: 1260, h: 2736 },
  "iphone-16": { label: "iPhone 16 · 15 · 15 Pro · 14 Pro", w: 1179, h: 2556 },
  "iphone-16-plus": { label: "iPhone 16 Plus · 15 Plus · 15 Pro Max · 14 Pro Max", w: 1290, h: 2796 },
  "iphone-14": { label: "iPhone 14 · 13 · 12", w: 1170, h: 2532 },
  android: { label: "Android (1080 × 2400)", w: 1080, h: 2400 },
} as const;

export type DeviceId = keyof typeof DEVICES;
export const DEVICE_IDS = Object.keys(DEVICES) as DeviceId[];
