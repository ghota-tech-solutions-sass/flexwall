/**
 * Telling a tap from a drag, for the one path that adds a tile to the wall.
 *
 * The library used HTML5 drag-and-drop, which never fires under a finger. With
 * pointer events both work, provided we know which gesture is happening: a
 * finger always taps (dragging a card out of a panel on a small screen is a
 * fight nobody wins), a mouse drags once it has moved far enough to mean it.
 */

export type DragIntent = "idle" | "tap" | "drag";

/** Pixels a mouse must travel before it means to drag rather than click. */
export const DRAG_THRESHOLD_PX = 8;

export interface Point {
  x: number;
  y: number;
}

export function movedBy(start: Point, current: Point): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

/**
 * What the pointer is doing: nothing yet, adding where it lands, or carrying a
 * tile to a cell. `coarse` is a finger, and a finger never carries.
 */
export function dragIntent(start: Point, current: Point, coarse: boolean): DragIntent {
  if (coarse) return "tap";
  return movedBy(start, current) >= DRAG_THRESHOLD_PX ? "drag" : "idle";
}
