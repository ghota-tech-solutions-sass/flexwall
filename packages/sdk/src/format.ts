import type { NumberValue, SeriesValue } from "./values";

/** 1,240 · 12.4k · 124k · 1.2M · 3.4B. Whole numbers below 10k keep every digit. */
export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim(n / 1e9) + "B";
  if (abs >= 1e6) return trim(n / 1e6) + "M";
  if (abs >= 1e4) return (abs >= 1e5 ? Math.round(n / 1e3) : trim(n / 1e3)) + "k";
  if (abs < 10 && !Number.isInteger(n)) return trim(n);
  return Math.round(n).toLocaleString("en-US");
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

const SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  jpy: "¥",
  cny: "¥",
  inr: "₹",
  krw: "₩",
  brl: "R$",
  cad: "$",
  aud: "$",
  nzd: "$",
  chf: "CHF ",
};

export function currencySymbol(currency: string | undefined): string {
  if (!currency) return "";
  return SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase() + " ";
}

/** Formats a number value with its unit: "$4.8k", "72%", "1,613". */
export function formatValue(v: Pick<NumberValue, "value" | "unit" | "currency">): string {
  if (v.unit === "currency") return currencySymbol(v.currency) + formatNumber(v.value);
  if (v.unit === "percent") return formatNumber(v.value) + "%";
  return formatNumber(v.value);
}

/** The power of ten at or below `n`: 3,480,000 → 1,000,000, 42 → 10. Below `min` the range is 0. */
export function bandFloor(n: number, min = 1000): number {
  if (!Number.isFinite(n) || n < min) return 0;
  return 10 ** Math.floor(Math.log10(n));
}

/**
 * A sensitive amount as a range: "$1M+", "€10k+", "under $1k", "10+ BTC"
 * once a label follows. It says how many figures, never the figures, so a
 * wall can flex without printing a balance someone could act on. Money starts
 * at $1k; plain amounts (coins) start at 1.
 */
export function formatBand(v: Pick<NumberValue, "value" | "unit" | "currency">): string {
  // A debt is a range too: "−$10k+" says how deep without saying the amount.
  if (v.value < 0) {
    const debt = formatBand({ ...v, value: -v.value });
    return debt.startsWith("under") ? debt : `−${debt}`;
  }
  const money = v.unit === "currency";
  const symbol = money ? currencySymbol(v.currency) : "";
  const floor = bandFloor(v.value, money ? 1000 : 1);
  if (floor === 0) return money ? `under ${symbol}1k` : "under 1";
  // formatNumber keeps every digit below 10k; a range reads better as "1k".
  return `${symbol}${floor === 1000 ? "1k" : formatNumber(floor)}+`;
}

/** How a number tile prints its value: "auto" gives ranges to sensitive metrics only. */
export type NumberDisplay = "auto" | "exact" | "range";

export const NUMBER_DISPLAY_OPTIONS: { value: NumberDisplay; label: string }[] = [
  { value: "auto", label: "Range for balances, exact otherwise" },
  { value: "exact", label: "Exact number" },
  { value: "range", label: "Range, like $1M+" },
];

/** Whether a tile prints a range instead of the number, from its option and the metric's sensitivity. */
export function showsRange(display: unknown, sensitive: boolean | undefined): boolean {
  if (display === "range") return true;
  if (display === "exact") return false;
  return Boolean(sensitive);
}

/** Change between the first and last points of a series, as a ratio (0.12 = +12%). Null when undefined. */
export function seriesChange(s: SeriesValue): number | null {
  if (s.points.length < 2) return null;
  const first = s.points[0].v;
  const last = s.points[s.points.length - 1].v;
  if (first === 0) return null;
  return (last - first) / Math.abs(first);
}

export function formatPercent(ratio: number, signed = false): string {
  const pct = Math.round(ratio * 1000) / 10;
  return (signed && pct > 0 ? "+" : "") + pct + "%";
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

/** Separators people type inside numbers: "1 240", "1,240", "1_240". */
const TYPED_SEPARATORS = /[\s,_]/g;

/** A number as someone types it, or null when it isn't one. Empty input is null too. */
export function parseTypedNumber(raw: string): number | null {
  const cleaned = raw.replace(TYPED_SEPARATORS, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
