import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { effectiveTheme } from "@/domain/wall";
import { IMAGE_HEADERS, lockscreenImage } from "@/rendering/images";

/** The image the iPhone Shortcut fetches every morning. The key in the path is the only credential. */
export async function GET(_req: Request, { params }: { params: Promise<{ wallId: string; key: string }> }) {
  const { wallId, key } = await params;
  const c = container();
  try {
    const { wall, owner, placed } = await c.getLockscreen.execute({ wallId, key: key.replace(/\.png$/, "") });
    const { states, today, entitlements } = await c.resolveWall.execute({ tiles: placed.map((p) => p.tile), owner, surface: "lockscreen" });
    return await lockscreenImage({
      device: wall.lockscreen.device,
      placed,
      states,
      theme: effectiveTheme(wall, c.catalog, entitlements),
      catalog: c.catalog,
      today,
      watermark: entitlements.watermark,
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") return new Response("not_found", { status: 404, headers: IMAGE_HEADERS });
    console.error("lock screen render failed:", error);
    return new Response("render_failed", { status: 500, headers: IMAGE_HEADERS });
  }
}
