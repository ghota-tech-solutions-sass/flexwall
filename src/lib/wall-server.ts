import { NextResponse } from "next/server";
import { THEMES, type WallConfig } from "@/lib/config";
import { resolveWall, type ResolveMode } from "@/lib/metrics";
import { renderWallpaper } from "@/lib/render";
import { getWall, type Wall } from "@/lib/store/walls";
import type { WallView } from "@/lib/site";
import { editKey, imageKey, verifyEditKey } from "@/lib/tokens";

/** Loads a wall for its owner: the edit key travels in `x-edit-key`. */
export async function authorizeOwner(req: Request, id: string): Promise<Wall | NextResponse> {
  const wall = await getWall(id);
  if (!wall) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!verifyEditKey(wall.id, wall.editNonce, req.headers.get("x-edit-key"))) {
    // Same answer as a missing wall: a wrong key shouldn't confirm the id exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return wall;
}

/** What the phone actually shows: Pro themes fall back to Ink until paid. */
export function effectiveConfig(wall: Pick<Wall, "config" | "pro">): WallConfig {
  if (wall.pro || !THEMES[wall.config.theme].pro) return wall.config;
  return { ...wall.config, theme: "ink" };
}

/**
 * Images must never be cached by anyone between us and the phone: the
 * Shortcut asks once a day and needs today's numbers, and a stale CDN copy
 * is the whole product failing silently.
 */
export const IMAGE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * Landing page samples are the opposite case: deterministic marketing images
 * every visitor requests. Cache them for an hour, matching the page's own
 * revalidation, so sample countdowns stay consistent with the page.
 */
const SAMPLE_HEADERS = { "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" };

export interface RenderRequest {
  config: WallConfig;
  mode: ResolveMode;
  wall?: Wall | null;
  watermark: boolean;
  width?: number;
}

export async function renderPng({ config, mode, wall, watermark, width }: RenderRequest): Promise<Response> {
  try {
    const data = await resolveWall({ config, mode, wall });
    // ImageResponse renders lazily while streaming; buffer it so a layout
    // error becomes a 500 here instead of a truncated PNG on someone's phone.
    const png = await renderWallpaper(config, data, { watermark, width }).arrayBuffer();
    const headers = mode === "sample" ? SAMPLE_HEADERS : IMAGE_HEADERS;
    return new Response(png, { headers: { ...headers, "Content-Type": "image/png" } });
  } catch (error) {
    console.error("render failed:", error);
    return new Response("render_failed", { status: 500, headers: IMAGE_HEADERS });
  }
}

export function toView(wall: Wall): WallView {
  return {
    id: wall.id,
    config: wall.config,
    pro: wall.pro,
    public: wall.public,
    imagePath: `/i/${wall.id}/${imageKey(wall.id, wall.imgNonce)}`,
    editPath: `/edit/${wall.id}?k=${editKey(wall.id, wall.editNonce)}`,
    lastRenderAt: wall.lastRenderAt ?? null,
    connections: Object.values(wall.connections ?? {})
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ id, source, label, public: details }) => ({ id, source, label, public: details })),
  };
}

/** Preview widths stay well under phone resolution, so a preview can't stand in for the image. */
export function previewWidth(raw: unknown): number {
  const w = Number(raw ?? 402);
  return Math.max(200, Math.min(603, Number.isFinite(w) ? w : 402));
}
