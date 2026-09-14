import { getWall } from "@/lib/store/walls";
import { IMAGE_HEADERS, renderPng } from "@/lib/wall-server";

/** Gallery thumbnail: only for walls their owner chose to show on /wall. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wall = await getWall((await params).id);
  if (!wall || !wall.pro || !wall.public) return new Response("not_found", { status: 404, headers: IMAGE_HEADERS });
  return renderPng({ config: wall.config, mode: "phone", wall, watermark: true, width: 603 });
}
