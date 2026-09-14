import type { NextRequest } from "next/server";
import { decodeConfig } from "@/lib/config";
import { getWall, noteRender } from "@/lib/store/walls";
import { verifyImageKey } from "@/lib/tokens";
import { effectiveConfig, IMAGE_HEADERS, renderPng } from "@/lib/wall-server";

/**
 * The URL the Shortcut fetches every morning: full device resolution, today's
 * numbers. The key in the path is the only thing protecting the owner's data.
 *
 * With `?c=` it is the editor's preview of unsaved changes instead: capped
 * resolution, the wall's own watermark rule, no render counted.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const wall = await getWall(id);
  if (!wall || !verifyImageKey(wall.id, wall.imgNonce, key.replace(/\.png$/, ""))) {
    return new Response("not_found", { status: 404, headers: IMAGE_HEADERS });
  }

  const draft = req.nextUrl.searchParams.get("c");
  if (draft !== null) {
    const config = decodeConfig(draft);
    if (!config) return new Response("invalid_config", { status: 422, headers: IMAGE_HEADERS });
    const w = Number(req.nextUrl.searchParams.get("w") ?? "402");
    return renderPng(config, { watermark: !wall.pro, width: Math.max(200, Math.min(603, Number.isFinite(w) ? w : 402)) });
  }

  const res = await renderPng(effectiveConfig(wall), { watermark: !wall.pro });
  if (res.ok) noteRender(wall).catch((error) => console.error("noteRender failed:", error));
  return res;
}
