import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DEVICES, type ThemeId, type WallConfig } from "@/lib/config";
import type { Display, Resolved } from "@/lib/metrics";
import type { ContributionDay } from "@/lib/sources/github";

/**
 * The wallpaper. Designed on a 402pt-wide canvas (an iPhone 17 Pro in points)
 * and scaled to the device's pixels, so every size below is in points.
 *
 * Lock screen anatomy decides the layout: the clock owns the top ~38%, the
 * flashlight and camera buttons own the bottom corners, notifications stack
 * up from the bottom. The numbers live in the band between.
 */

const DESIGN_W = 402;

type FontName = "Grotesk" | "Mono" | "Serif" | "Inter";

const fontFile = (f: string) => readFileSync(join(process.cwd(), "assets/fonts", f));
const FONTS = [
  { name: "Grotesk", data: fontFile("space-grotesk-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Grotesk", data: fontFile("space-grotesk-700.woff"), weight: 700 as const, style: "normal" as const },
  { name: "Mono", data: fontFile("jetbrains-mono-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Mono", data: fontFile("jetbrains-mono-800.woff"), weight: 800 as const, style: "normal" as const },
  { name: "Serif", data: fontFile("instrument-serif-400.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: fontFile("inter-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Inter", data: fontFile("inter-800.woff"), weight: 800 as const, style: "normal" as const },
];

interface Palette {
  background: string;
  ink: string;
  muted: string;
  accent: string;
  track: string;
  heat: [string, string, string, string, string];
  heroFont: FontName;
  heroWeight: number;
  bodyFont: FontName;
  /** Serif display faces read smaller than grotesks at the same size. */
  heroScale: number;
  caps: boolean;
}

export const PALETTES: Record<ThemeId, Palette> = {
  ink: {
    background: "linear-gradient(180deg, #0a0a0b 0%, #141416 100%)",
    ink: "#f4f1ea",
    muted: "#8a867e",
    accent: "#f4f1ea",
    track: "rgba(244,241,234,0.12)",
    heat: ["rgba(244,241,234,0.07)", "rgba(244,241,234,0.28)", "rgba(244,241,234,0.5)", "rgba(244,241,234,0.75)", "#f4f1ea"],
    heroFont: "Grotesk",
    heroWeight: 700,
    bodyFont: "Grotesk",
    heroScale: 1,
    caps: true,
  },
  paper: {
    background: "#eeeae1",
    ink: "#161513",
    muted: "#77726a",
    accent: "#e0482a",
    track: "rgba(22,21,19,0.1)",
    heat: ["rgba(22,21,19,0.07)", "rgba(224,72,42,0.3)", "rgba(224,72,42,0.55)", "rgba(224,72,42,0.8)", "#e0482a"],
    heroFont: "Grotesk",
    heroWeight: 700,
    bodyFont: "Grotesk",
    heroScale: 1,
    caps: true,
  },
  gold: {
    background: "radial-gradient(circle at 50% 55%, #173026 0%, #0b1712 70%)",
    ink: "#efe6d2",
    muted: "#9d9580",
    accent: "#c9a45c",
    track: "rgba(201,164,92,0.18)",
    heat: ["rgba(239,230,210,0.07)", "rgba(201,164,92,0.3)", "rgba(201,164,92,0.55)", "rgba(201,164,92,0.8)", "#d8b46a"],
    heroFont: "Serif",
    heroWeight: 400,
    bodyFont: "Inter",
    heroScale: 1.22,
    caps: true,
  },
  terminal: {
    background: "#040705",
    ink: "#7dff9e",
    muted: "#3d8a55",
    accent: "#7dff9e",
    track: "rgba(125,255,158,0.14)",
    heat: ["rgba(125,255,158,0.07)", "rgba(125,255,158,0.3)", "rgba(125,255,158,0.52)", "rgba(125,255,158,0.76)", "#7dff9e"],
    heroFont: "Mono",
    heroWeight: 800,
    bodyFont: "Mono",
    heroScale: 0.86,
    caps: false,
  },
  sunset: {
    background: "linear-gradient(160deg, #ff7a3d 0%, #ff2d6f 48%, #5a2dff 100%)",
    ink: "#ffffff",
    muted: "rgba(255,255,255,0.72)",
    accent: "#ffffff",
    track: "rgba(255,255,255,0.25)",
    heat: ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.35)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.78)", "#ffffff"],
    heroFont: "Inter",
    heroWeight: 800,
    bodyFont: "Inter",
    heroScale: 0.96,
    caps: true,
  },
  serif: {
    background: "#f5f1e8",
    ink: "#121110",
    muted: "#7a746a",
    accent: "#121110",
    track: "rgba(18,17,16,0.1)",
    heat: ["rgba(18,17,16,0.06)", "rgba(18,17,16,0.25)", "rgba(18,17,16,0.45)", "rgba(18,17,16,0.7)", "#121110"],
    heroFont: "Serif",
    heroWeight: 400,
    bodyFont: "Inter",
    heroScale: 1.3,
    caps: false,
  },
};

export interface RenderOptions {
  /** Output width in pixels; defaults to the device's. Height keeps the device ratio. */
  width?: number;
  watermark: boolean;
}

export function renderWallpaper(config: WallConfig, data: Resolved, opts: RenderOptions): ImageResponse {
  const device = DEVICES[config.device];
  const width = Math.round(opts.width ?? device.w);
  const height = Math.round((width * device.h) / device.w);
  const s = width / DESIGN_W;
  const H = height / s; // canvas height in points
  const p = PALETTES[config.theme];
  const pad = 30;
  const inner = DESIGN_W - pad * 2;
  const pt = (n: number) => n * s;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: p.background,
          color: p.ink,
          fontFamily: p.bodyFont,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: pt(H * 0.4),
            left: pt(pad),
            width: pt(inner),
            display: "flex",
            flexDirection: "column",
          }}
        >
          {config.caption ? (
            <div style={{ display: "flex", fontSize: pt(12), letterSpacing: pt(p.caps ? 2.2 : 0.4), color: p.muted, marginBottom: pt(6) }}>
              {p.caps ? config.caption.toUpperCase() : config.caption}
            </div>
          ) : null}
          <Hero d={data.hero} p={p} pt={pt} width={inner} max={data.heatmap ? 96 : 118} />
          {data.stats.length > 0 ? <Stats items={data.stats} p={p} pt={pt} /> : null}
          {data.heatmap ? <Heatmap days={data.heatmap} p={p} pt={pt} width={inner} /> : null}
        </div>
        {opts.watermark ? (
          <div
            style={{
              position: "absolute",
              bottom: pt(H * 0.085),
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              fontSize: pt(10),
              letterSpacing: pt(1.6),
              color: p.muted,
            }}
          >
            FLEXWALL.LOL
          </div>
        ) : null}
      </div>
    ),
    { width, height, fonts: FONTS }
  );
}

type Pt = (n: number) => number;

function heroSize(value: string, width: number, scale: number): number {
  // Widest glyphs are ~0.62em in these faces; keep the number on one line.
  const byWidth = width / Math.max(3, value.length * 0.62);
  return Math.min(118, byWidth) * scale;
}

function Hero({ d, p, pt, width, max }: { d: Display; p: Palette; pt: Pt; width: number; max: number }) {
  const size = Math.min(heroSize(d.value + (d.of ? "   " : ""), width * (d.of ? 0.8 : 1), p.heroScale), max * p.heroScale);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <div
          style={{
            display: "flex",
            fontFamily: p.heroFont,
            fontWeight: p.heroWeight,
            fontSize: pt(size),
            lineHeight: 0.92,
            letterSpacing: pt(p.heroFont === "Serif" ? -1 : -size * 0.045),
          }}
        >
          {d.value}
        </div>
        {d.of ? (
          <div style={{ display: "flex", fontSize: pt(20), color: p.muted, marginLeft: pt(10), marginBottom: pt(size * 0.1) }}>{d.of}</div>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: pt(16), color: p.muted, marginTop: pt(8) }}>{d.label}</div>
      {d.progress !== undefined ? <Bar progress={d.progress} p={p} pt={pt} height={6} top={16} /> : null}
    </div>
  );
}

function Bar({ progress, p, pt, height, top }: { progress: number; p: Palette; pt: Pt; height: number; top: number }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div style={{ display: "flex", width: "100%", height: pt(height), marginTop: pt(top), borderRadius: pt(height), background: p.track }}>
      <div style={{ display: "flex", width: `${Math.max(pct, 1.5)}%`, height: "100%", borderRadius: pt(height), background: p.accent }} />
    </div>
  );
}

function Stats({ items, p, pt }: { items: Display[]; p: Palette; pt: Pt }) {
  return (
    <div style={{ display: "flex", marginTop: pt(26), borderTop: `${pt(1)}px solid ${p.track}`, paddingTop: pt(14) }}>
      {items.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: pt(10) }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ display: "flex", fontFamily: p.heroFont, fontWeight: p.heroWeight, fontSize: pt(30 * p.heroScale), lineHeight: 1 }}>
              {d.value}
            </div>
            {d.of ? <div style={{ display: "flex", fontSize: pt(11), color: p.muted, marginLeft: pt(4) }}>{d.of}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: pt(11), color: p.muted, marginTop: pt(6), lineHeight: 1.25 }}>{d.label}</div>
          {d.progress !== undefined ? <Bar progress={d.progress} p={p} pt={pt} height={3} top={8} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Weeks as columns, Sunday on top, like GitHub's own graph. */
export function heatmapColumns(days: ContributionDay[], weeks: number): (ContributionDay | null)[][] {
  const cols: (ContributionDay | null)[][] = [];
  let col: (ContributionDay | null)[] = [];
  for (const day of days) {
    const dow = new Date(day.date + "T00:00:00Z").getUTCDay();
    if (dow === 0 && col.length > 0) {
      cols.push(col);
      col = [];
    }
    if (col.length === 0 && cols.length === 0) for (let i = 0; i < dow; i++) col.push(null);
    col.push(day);
  }
  if (col.length > 0) {
    while (col.length < 7) col.push(null);
    cols.push(col);
  }
  return cols.slice(-weeks);
}

function Heatmap({ days, p, pt, width }: { days: ContributionDay[]; p: Palette; pt: Pt; width: number }) {
  const weeks = 26;
  const gap = 2.6;
  const cols = heatmapColumns(days, weeks);
  const cell = (width - gap * (weeks - 1)) / weeks;
  return (
    <div style={{ display: "flex", marginTop: pt(24), gap: pt(gap) }}>
      {cols.map((col, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: pt(gap) }}>
          {col.map((day, j) => (
            <div
              key={j}
              style={{
                display: "flex",
                width: pt(cell),
                height: pt(cell),
                borderRadius: pt(cell * 0.22),
                background: day ? p.heat[Math.min(4, day.level)] : "transparent",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
