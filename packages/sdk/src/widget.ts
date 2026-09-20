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
  /** `sensitive` comes from the metric: widgets show it as a range unless the tile asks for the exact number. */
  /** `domain` is an optional public hostname only: no port, URL path, query or credentials. */
  source?: { connector: string; name: string; verified: boolean; sample?: boolean; sensitive?: boolean; domain?: string };
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

/** Library shelves, in the order the editor lists them. */
export const WIDGET_CATEGORIES = ["numbers", "charts", "progress", "time", "content"] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

/** How a widget is framed: the theme's card around it, or the full tile. */
export type Chrome = "card" | "bare";
export const DEFAULT_CHROME: Chrome = "card";

export interface WidgetDef<O extends FieldValues = FieldValues> {
  /** Unique across all plugins. Lowercase, digits, dashes. */
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  inputs: WidgetInputDef[];
  options: Field[];
  size: { default: Size; min: Size; max: Size };
  /** "card" draws the theme's tile background and padding around the widget; "bare" gives it the full tile. */
  chrome?: Chrome;
  /** Surfaces this widget can't draw on. Images can't show interactive content, for instance. */
  excludeSurfaces?: Surface[];
  /** Pure: no hooks, no handlers, inline styles, Satori-safe elements. Runs on the server and in the editor. */
  render(props: WidgetProps<O>): ReactElement;
  /** Optional richer page version (links, titles). Same purity rules. Falls back to `render`. */
  renderPage?(props: WidgetProps<O>): ReactElement;
}

/** One grid cell, in units. Units are a hundredth of a cell so widgets size themselves without pixels. */
export const CELL_UNITS = 100;

/** Space between tiles, in units. Fixed so widgets can reason about multi-cell tiles. */
export const GAP_UNITS = 12;

/** Length of a run of `cells` cells and the gaps between them, in units. */
export function gridUnits(cells: number): number {
  return cells * CELL_UNITS + (cells - 1) * GAP_UNITS;
}

/** Padding of "card" chrome, in units, on every side. */
export const CARD_PADDING_UNITS = 14;

/** The widget's drawing area in units for a tile of `box` cells. */
export function areaOf(box: { w: number; h: number }, chrome: Chrome = DEFAULT_CHROME): { width: number; height: number } {
  const pad = chrome === "card" ? CARD_PADDING_UNITS * 2 : 0;
  return { width: gridUnits(box.w) - pad, height: gridUnits(box.h) - pad };
}

export function defineWidget<O extends FieldValues = FieldValues>(def: WidgetDef<O>): WidgetDef<O> {
  return def;
}
