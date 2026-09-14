/**
 * Values are what flows from a connector to a widget. Widgets declare which
 * types they accept; any connector metric of that type fits.
 */

export type Unit = "currency" | "count" | "percent" | "duration";

export interface NumberValue {
  type: "number";
  value: number;
  unit?: Unit;
  /** ISO 4217, lowercase, when unit is "currency". */
  currency?: string;
}

export interface SeriesPoint {
  /** Day, YYYY-MM-DD. */
  t: string;
  v: number;
}

export interface SeriesValue {
  type: "series";
  /** Oldest first. */
  points: SeriesPoint[];
  unit?: Unit;
  currency?: string;
}

export interface CalendarDay {
  date: string;
  count: number;
  /** 0 (none) to 4 (most), like GitHub's contribution graph. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface CalendarValue {
  type: "calendar";
  /** Oldest first. */
  days: CalendarDay[];
}

export interface TextValue {
  type: "text";
  value: string;
}

export type Value = NumberValue | SeriesValue | CalendarValue | TextValue;
export type ValueType = Value["type"];
export type ValueOf<T extends ValueType> = Extract<Value, { type: T }>;

export const VALUE_TYPES: readonly ValueType[] = ["number", "series", "calendar", "text"];

export function number(value: number, extra: Omit<NumberValue, "type" | "value"> = {}): NumberValue {
  return { type: "number", value, ...extra };
}

export function money(value: number, currency: string): NumberValue {
  return { type: "number", value, unit: "currency", currency: currency.toLowerCase() };
}

export function series(points: SeriesPoint[], extra: Omit<SeriesValue, "type" | "points"> = {}): SeriesValue {
  return { type: "series", points, ...extra };
}

export function calendar(days: CalendarDay[]): CalendarValue {
  return { type: "calendar", days };
}

export function text(value: string): TextValue {
  return { type: "text", value };
}

/** Narrowing helper for widgets: `asType(input, "number")?.value`. */
export function asType<T extends ValueType>(value: Value | null | undefined, type: T): ValueOf<T> | null {
  return value && value.type === type ? (value as ValueOf<T>) : null;
}

/** Runtime check for values coming back from plugins or storage. */
export function isValue(v: unknown): v is Value {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case "number":
      return typeof o.value === "number" && Number.isFinite(o.value);
    case "text":
      return typeof o.value === "string";
    case "series":
      return Array.isArray(o.points) && o.points.every((p) => p && typeof p.t === "string" && typeof p.v === "number");
    case "calendar":
      return Array.isArray(o.days) && o.days.every((d) => d && typeof d.date === "string" && typeof d.count === "number");
    default:
      return false;
  }
}
