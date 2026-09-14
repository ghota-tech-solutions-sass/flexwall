import type { ReactElement } from "react";
import type { Field, FieldValues } from "./fields";
import type { Theme } from "./theme";
import type { Value, ValueType } from "./values";

/**
 * A widget is how values are shown. It renders once for every surface: the
 * public page, the editor, share cards and lock screens. See `docs/widgets.md`
 * for the two rules that make that work (Satori-safe markup, units not pixels).
 */

/** Where a tile is being drawn. Most widgets ignore it. */
export type Surface = "page" | "editor" | "card" | "lockscreen";

/** A length: pixels on images, a CSS length on the page. Pass it straight to a style. */
export type Length = number | string;

/** `u(n)` is n hundredths of one grid cell. A 2×1 tile is 212 units wide (2 cells plus one 12-unit gap). */
export type UnitFn = (n: number) => Length;

export interface InputValue {
  value: Value;
  /** The upstream was unreachable; this is the last known value. */
  stale: boolean;
  source?: { connector: string; name: string; verified: boolean };
}

export interface WidgetInputDef {
  key: string;
  label: string;
  accepts: ValueType[];
  /** Optional inputs may be missing; required ones are guaranteed present when `render` runs. */
  optional?: boolean;
}

export interface WidgetProps<O extends FieldValues = FieldValues> {
  inputs: Record<string, InputValue | undefined>;
  options: O;
  /** Tile size in grid cells. */
  box: { w: number; h: number };
  /**
   * Space the widget draws in, in units: the tile (`box.w * 100 + (box.w - 1) * GAP_UNITS`
   * wide) minus the card padding when `chrome` is "card". Use it to fit content.
   */
  area: { width: number; height: number };
  theme: Theme;
  surface: Surface;
  u: UnitFn;
  /** The wall owner's today, YYYY-MM-DD. Time widgets use it so a wall in Tokyo turns the page at Tokyo midnight. */
  today: string;
}

export type Size = readonly [w: number, h: number];

export interface WidgetDef<O extends FieldValues = FieldValues> {
  /** Unique across all plugins. Lowercase, digits, dashes. */
  id: string;
  name: string;
  description: string;
  category: "numbers" | "progress" | "time" | "charts" | "content";
  inputs: WidgetInputDef[];
  options: Field[];
  size: { default: Size; min: Size; max: Size };
  /** "card" draws the theme's tile background and padding around the widget; "bare" gives it the full tile. */
  chrome?: "card" | "bare";
  /** Surfaces this widget can't draw on. Images can't show interactive content, for instance. */
  excludeSurfaces?: Surface[];
  /** Pure: no hooks, no handlers, inline styles, Satori-safe elements. Runs on the server and in the editor. */
  render(props: WidgetProps<O>): ReactElement;
  /** Optional richer page version (links, titles). Same purity rules. Falls back to `render`. */
  renderPage?(props: WidgetProps<O>): ReactElement;
}

/** Space between tiles, in units. Fixed so widgets can reason about multi-cell tiles. */
export const GAP_UNITS = 12;

/** Padding of "card" chrome, in units, on every side. */
export const CARD_PADDING_UNITS = 14;

/** The widget's drawing area in units for a tile of `box` cells. */
export function areaOf(box: { w: number; h: number }, chrome: "card" | "bare" = "card"): { width: number; height: number } {
  const pad = chrome === "card" ? CARD_PADDING_UNITS * 2 : 0;
  return { width: box.w * 100 + (box.w - 1) * GAP_UNITS - pad, height: box.h * 100 + (box.h - 1) * GAP_UNITS - pad };
}

export function defineWidget<O extends FieldValues = FieldValues>(def: WidgetDef<O>): WidgetDef<O> {
  return def;
}
