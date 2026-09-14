import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { GAP_UNITS, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import { DEVICES, LOCK_COLUMNS, LOCK_ROWS, type Box, type DeviceId } from "@/domain/layout";
import type { Tile } from "@/domain/wall";
import { TileBody } from "./tile";

/**
 * Images of a wall, drawn by Satori. Grid boxes become absolutely positioned
 * tiles (Satori has no CSS grid); units become pixels.
 */

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));
const FONTS = [
  { name: "Grotesk", data: font("space-grotesk-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Grotesk", data: font("space-grotesk-700.woff"), weight: 700 as const, style: "normal" as const },
  { name: "Inter", data: font("inter-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Inter", data: font("inter-800.woff"), weight: 800 as const, style: "normal" as const },
  { name: "Mono", data: font("jetbrains-mono-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Mono", data: font("jetbrains-mono-800.woff"), weight: 800 as const, style: "normal" as const },
  { name: "Serif", data: font("instrument-serif-400.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Archivo", data: font("archivo-400.ttf"), weight: 400 as const, style: "normal" as const },
  { name: "Archivo", data: font("archivo-600.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Archivo Wide", data: font("archivo-wide-600.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Archivo Wide", data: font("archivo-wide-800.ttf"), weight: 800 as const, style: "normal" as const },
];

export const IMAGE_HEADERS = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

interface Placed {
  tile: Tile;
  box: Box;
}

interface GridProps {
  placed: Placed[];
  states: Record<string, TileState>;
  theme: Theme;
  catalog: Catalog;
  today: string;
  /** Pixels per grid unit (a cell is 100 units). */
  scale: number;
  left: number;
  top: number;
  surface: "card" | "lockscreen";
}

function Grid({ placed, states, theme, catalog, today, scale, left, top, surface }: GridProps) {
  const u = (n: number) => n * scale;
  const step = (100 + GAP_UNITS) * scale;
  return (
    <>
      {placed.map(({ tile, box }) => (
        <div
          key={tile.id}
          style={{
            position: "absolute",
            display: "flex",
            left: left + box.x * step,
            top: top + box.y * step,
            width: (box.w * 100 + (box.w - 1) * GAP_UNITS) * scale,
            height: (box.h * 100 + (box.h - 1) * GAP_UNITS) * scale,
          }}
        >
          <TileBody tile={tile} state={states[tile.id]} box={{ w: box.w, h: box.h }} theme={theme} surface={surface} u={u} today={today} catalog={catalog} />
        </div>
      ))}
    </>
  );
}

async function png(element: React.ReactElement, width: number, height: number): Promise<Response> {
  // Buffered so a layout error becomes a 500 here, not a truncated image on a phone.
  const body = await new ImageResponse(element, { width, height, fonts: FONTS }).arrayBuffer();
  return new Response(body, { headers: { ...IMAGE_HEADERS, "Content-Type": "image/png" } });
}

/**
 * The lock screen: tiles in the band between the clock (top 38%) and the
 * flashlight and camera buttons (bottom 12%), 4×4 cells wide.
 */
export function lockscreenImage(input: { device: DeviceId; placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string; watermark: boolean; width?: number }) {
  const device = DEVICES[input.device];
  const width = Math.round(input.width ?? device.w);
  const height = Math.round((width * device.h) / device.w);
  const margin = width * 0.075;
  const gridUnitsWide = LOCK_COLUMNS * 100 + (LOCK_COLUMNS - 1) * GAP_UNITS;
  const scale = (width - margin * 2) / gridUnitsWide;
  const gridHeight = (LOCK_ROWS * 100 + (LOCK_ROWS - 1) * GAP_UNITS) * scale;
  const top = Math.max(height * 0.4, height * 0.87 - gridHeight);

  return png(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: input.theme.page }}>
      <Grid placed={input.placed} states={input.states} theme={input.theme} catalog={input.catalog} today={input.today} scale={scale} left={margin} top={top} surface="lockscreen" />
      {input.watermark ? (
        <div style={{ position: "absolute", bottom: height * 0.035, left: 0, right: 0, display: "flex", justifyContent: "center", fontSize: 11 * (width / 402), letterSpacing: 1.5 * (width / 402), color: input.theme.muted }}>
          FLEXWALL.LOL
        </div>
      ) : null}
    </div>,
    width,
    height
  );
}

/** The share card: handle and title on the left, the first public tiles on a 2-row grid on the right. */
export function shareCardImage(input: { handle: string; title: string; bio: string; placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string }) {
  const width = 1200;
  const height = 630;
  const theme = input.theme;
  const gridLeft = 470;
  const scale = (width - gridLeft - 56) / (4 * 100 + 3 * GAP_UNITS);
  const rows = Math.max(1, input.placed.reduce((h, p) => Math.max(h, p.box.y + p.box.h), 0));
  const gridHeight = (rows * 100 + (rows - 1) * GAP_UNITS) * scale;

  return png(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: theme.page, color: theme.ink, fontFamily: theme.body.family }}>
      <div style={{ position: "absolute", left: 64, top: 64, width: 360, bottom: 64, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 28, color: theme.muted }}>{`@${input.handle}`}</div>
          <div style={{ display: "flex", fontSize: 54, lineHeight: 1.05, marginTop: 14, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{input.title}</div>
          {input.bio ? <div style={{ display: "flex", fontSize: 24, lineHeight: 1.35, marginTop: 18, color: theme.muted }}>{input.bio.slice(0, 120)}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: theme.muted }}>flexwall.lol</div>
      </div>
      <Grid placed={input.placed} states={input.states} theme={theme} catalog={input.catalog} today={input.today} scale={scale} left={gridLeft} top={(height - gridHeight) / 2} surface="card" />
    </div>,
    width,
    height
  );
}
