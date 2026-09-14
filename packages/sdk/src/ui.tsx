import type { CSSProperties, ReactNode } from "react";
import type { Length } from "./widget";

/**
 * Satori-safe building blocks. Satori (the image renderer) needs
 * `display: flex` on any element with more than one child and only
 * understands flexbox, absolute positioning and inline styles. These wrap
 * that once so widget code reads like normal layout code.
 */

type Style = CSSProperties;

interface BoxProps {
  children?: ReactNode;
  style?: Style;
}

export function Col({ children, style }: BoxProps) {
  return <div style={{ display: "flex", flexDirection: "column", minWidth: 0, ...style }}>{children}</div>;
}

export function Row({ children, style }: BoxProps) {
  return <div style={{ display: "flex", flexDirection: "row", alignItems: "center", minWidth: 0, ...style }}>{children}</div>;
}

/** Takes the remaining space in a Row or Col. */
export function Fill({ children, style }: BoxProps) {
  return <div style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, ...style }}>{children}</div>;
}

export function Text({ children, style }: BoxProps) {
  return <div style={{ display: "flex", whiteSpace: "nowrap", overflow: "hidden", ...style }}>{children}</div>;
}

/** Horizontal progress bar. `value` is 0 to 1. */
export function Bar({ value, height, color, track, radius }: { value: number; height: Length; color: string; track: string; radius?: Length }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: "flex", width: "100%", height, background: track, borderRadius: radius ?? height, overflow: "hidden" }}>
      <div style={{ display: "flex", width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, height: "100%", background: color, borderRadius: radius ?? height }} />
    </div>
  );
}

/**
 * Points for an SVG polyline in a 0–100 × 0–100 viewBox, oldest on the left.
 * Draw with `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"`
 * so the line stays crisp at any tile size.
 */
export function sparkPoints(values: readonly number[], padding = 6): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,50 100,50`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = padding + (1 - (v - min) / span) * (100 - padding * 2);
      return `${round(x)},${round(y)}`;
    })
    .join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A font size (in units) that fits `text` on one line in `width` units,
 * capped at `max`. Glyphs average about 0.6em in the host's fonts.
 */
export function fitFont(text: string, width: number, max: number, ratio = 0.6): number {
  const byWidth = width / Math.max(1, text.length * ratio);
  return Math.max(6, Math.min(max, byWidth));
}
