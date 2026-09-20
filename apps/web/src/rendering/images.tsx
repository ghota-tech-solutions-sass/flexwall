import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CELL_UNITS, GAP_UNITS, gridUnits, themeBackground, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import { monogram } from "@/presentation/wall/profile";
import { formatHandle } from "@/domain/handle";
import { DEVICES, heightOf, lockscreenGeometry, packInto, WALL_COLUMNS, WATERMARK, type Box, type DeviceId } from "@/domain/layout";
import type { Tile } from "@/domain/wall";
import { SITE_HOST } from "@/presentation/brand";
import { TileBody } from "./tile";

/**
 * Images of a wall, drawn by Satori. Grid boxes become absolutely positioned
 * tiles (Satori has no CSS grid); units become pixels.
 */

/** Font files, relative to the app root. The page loads the same files through globals.css. */
const FONT_DIR = "public/fonts";
const font = (file: string) => readFileSync(join(process.cwd(), FONT_DIR, file));
const FONTS = [
  { name: "Grotesk", data: font("space-grotesk-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Grotesk", data: font("space-grotesk-700.woff"), weight: 700 as const, style: "normal" as const },
  { name: "Inter", data: font("inter-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Inter", data: font("inter-800.woff"), weight: 800 as const, style: "normal" as const },
  { name: "Mono", data: font("jetbrains-mono-500.woff"), weight: 500 as const, style: "normal" as const },
  { name: "Mono", data: font("jetbrains-mono-800.woff"), weight: 800 as const, style: "normal" as const },
  { name: "Serif", data: font("instrument-serif-400.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Geist", data: font("geist-400.ttf"), weight: 400 as const, style: "normal" as const },
  { name: "Geist", data: font("geist-500.ttf"), weight: 500 as const, style: "normal" as const },
  { name: "Geist", data: font("geist-600.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Geist", data: font("geist-700.ttf"), weight: 700 as const, style: "normal" as const },
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
  /** Pixels per grid unit (a cell is CELL_UNITS units). */
  scale: number;
  left: number;
  top: number;
  surface: "card" | "lockscreen";
}

function Grid({ placed, states, theme, catalog, today, scale, left, top, surface }: GridProps) {
  const u = (n: number) => n * scale;
  const step = (CELL_UNITS + GAP_UNITS) * scale;
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
            width: gridUnits(box.w) * scale,
            height: gridUnits(box.h) * scale,
          }}
        >
          <TileBody tile={tile} state={states[tile.id]} box={{ w: box.w, h: box.h }} theme={theme} surface={surface} u={u} today={today} catalog={catalog} />
        </div>
      ))}
    </>
  );
}

/** Marketing cards show sample numbers only: anyone may cache them. */
export const PUBLIC_IMAGE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

async function png(element: React.ReactElement, width: number, height: number, headers: Record<string, string> = IMAGE_HEADERS): Promise<Response> {
  // Buffered so a layout error becomes a 500 here, not a truncated image on a phone.
  const body = await new ImageResponse(element, { width, height, fonts: FONTS }).arrayBuffer();
  return new Response(body, { headers: { ...headers, "Content-Type": "image/png" } });
}

/** The lock screen: tiles in the band `lockscreenGeometry` measures, between the clock and the flashlight and camera buttons. */
export function lockscreenImage(input: { device: DeviceId; placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string; watermark: boolean; width?: number }) {
  const device = DEVICES[input.device];
  const width = Math.round(input.width ?? device.w);
  const geometry = lockscreenGeometry(width, device);
  const height = Math.round(geometry.height);

  return png(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", ...themeBackground(input.theme) }}>
      <Grid placed={input.placed} states={input.states} theme={input.theme} catalog={input.catalog} today={input.today} scale={geometry.scale} left={geometry.margin} top={geometry.top} surface="lockscreen" />
      {input.watermark ? (
        <div style={{ position: "absolute", bottom: geometry.watermark.bottom, left: 0, right: 0, display: "flex", justifyContent: "center", fontSize: geometry.watermark.fontSize, letterSpacing: geometry.watermark.letterSpacing, color: input.theme.muted }}>
          {WATERMARK.text}
        </div>
      ) : null}
    </div>,
    width,
    height
  );
}

interface CardText {
  /** Small line above the title: a handle, or what the page is. */
  kicker: string;
  title: string;
  body: string;
}

/** Social cards, the size X, Slack and iMessage unfold. */
export const CARD_SIZE = { width: 1200, height: 630 } as const;

/** A card shows the wall's first rows: as many tiles as this grid holds. */
export const CARD_GRID = { columns: WALL_COLUMNS, rows: 2 } as const;

/** Where a card puts things, in pixels: text in a column on the left, tiles from `gridLeft` to `gridRight` from the right edge. */
const CARD_LAYOUT = {
  padding: 64,
  textWidth: 360,
  gridLeft: 470,
  gridRight: 56,
  kicker: { fontSize: 28 },
  /** Titles longer than `longAfter` characters take the smaller size. */
  title: { fontSize: 54, longFontSize: 44, longAfter: 28, lineHeight: 1.05, gap: 14 },
  body: { fontSize: 24, lineHeight: 1.35, gap: 18, maxChars: 120 },
  footer: { fontSize: 22 },
} as const;

/** The tiles a card has room for, packed in reading order. */
export function placeOnCard(tiles: readonly Tile[]): Placed[] {
  return packInto(tiles, CARD_GRID.columns, CARD_GRID.rows).map(({ item, box }) => ({ tile: item, box }));
}

function card(text: CardText, input: { placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string }, headers?: Record<string, string>) {
  const { width, height } = CARD_SIZE;
  const { padding, textWidth, gridLeft, gridRight, kicker, title, body, footer } = CARD_LAYOUT;
  const theme = input.theme;
  const scale = (width - gridLeft - gridRight) / gridUnits(CARD_GRID.columns);
  const rows = Math.max(1, heightOf(input.placed.map((p) => p.box)));
  const gridHeight = gridUnits(rows) * scale;
  const titleSize = text.title.length > title.longAfter ? title.longFontSize : title.fontSize;

  return png(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", ...themeBackground(theme), color: theme.ink, fontFamily: theme.body.family }}>
      <div style={{ position: "absolute", left: padding, top: padding, width: textWidth, bottom: padding, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 14, background: theme.ink, color: theme.page, fontFamily: theme.display.family, fontSize: 22, transform: "rotate(-4deg)" }}>{monogram(text.title, text.kicker)}</div>
            <div style={{ display: "flex", fontSize: kicker.fontSize, color: theme.muted }}>{text.kicker}</div>
          </div>
          <div style={{ display: "flex", fontSize: titleSize, lineHeight: title.lineHeight, marginTop: title.gap, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{text.title}</div>
          {text.body ? <div style={{ display: "flex", fontSize: body.fontSize, lineHeight: body.lineHeight, marginTop: body.gap, color: theme.muted }}>{text.body.slice(0, body.maxChars)}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: footer.fontSize, color: theme.muted }}>{SITE_HOST}</div>
      </div>
      <Grid placed={input.placed} states={input.states} theme={theme} catalog={input.catalog} today={input.today} scale={scale} left={gridLeft} top={(height - gridHeight) / 2} surface="card" />
    </div>,
    width,
    height,
    headers
  );
}

/** The share card: handle and title on the left, the first public tiles on a 2-row grid on the right. */
export function shareCardImage(input: { handle: string; title: string; bio: string; placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string }) {
  return card({ kicker: formatHandle(input.handle), title: input.title, body: input.bio }, input);
}

/** A card for a site page (home, pricing, an integration): what the page is on the left, sample tiles on the right. */
export function pageCardImage(input: { kicker: string; title: string; body: string; placed: Placed[]; states: Record<string, TileState>; theme: Theme; catalog: Catalog; today: string }) {
  return card({ kicker: input.kicker, title: input.title, body: input.body }, input, PUBLIC_IMAGE_HEADERS);
}
