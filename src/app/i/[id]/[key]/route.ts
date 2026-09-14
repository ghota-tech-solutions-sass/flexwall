import { getWall, noteRender } from "@/lib/store/walls";
import { verifyImageKey } from "@/lib/tokens";
import { effectiveConfig, IMAGE_HEADERS, renderPng } from "@/lib/wall-server";

/**
 * The URL the Shortcut fetches every morning: full device resolution, today's
 * numbers. The key in the path is the only thing protecting the owner's data,
 * so this route renders the saved config and nothing else: no draft configs,
 * which could aim the owner's stored connections at other metrics.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const wall = await getWall(id);
  if (!wall || !verifyImageKey(wall.id, wall.imgNonce, key.replace(/\.png$/, ""))) {
    return new Response("not_found", { status: 404, headers: IMAGE_HEADERS });
  }
  const res = await renderPng({ config: effectiveConfig(wall), mode: "phone", wall, watermark: !wall.pro });
  if (res.ok) noteRender(wall).catch((error) => console.error("noteRender failed:", error));
  return res;
}
