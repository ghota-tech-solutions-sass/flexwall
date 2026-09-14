import { packInto } from "@/domain/layout";
import { todayIn } from "@/domain/time";
import { catalog } from "@/plugins/registry";
import { lockscreenImage, shareCardImage } from "@/rendering/images";
import { demoWall, sampleStates } from "@/rendering/samples";

/**
 * Images of the demo wall for the landing page, sample numbers only. Rendered
 * once at build time and refreshed daily, never per request: drawing them
 * takes seconds, and the page showed an empty phone meanwhile.
 */
export const dynamic = "force-static";
export const revalidate = 86400;

const IMAGES = ["lockscreen.png", "lockscreen-dark.png", "card.png", "card-dark.png"] as const;

export function generateStaticParams() {
  return IMAGES.map((image) => ({ image }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ image: string }> }) {
  const { image } = await params;
  if (!(IMAGES as readonly string[]).includes(image)) return new Response("not_found", { status: 404 });
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  // "-dark" variants draw the same wall on Midnight, for pages seen in dark mode.
  const theme = catalog.theme(image.endsWith("-dark.png") ? "midnight" : wall.theme)!;
  const states = sampleStates(wall.tiles, catalog);
  const res = image.startsWith("lockscreen")
    ? await lockscreenImage({
        device: "iphone-17-pro",
        placed: wall.lockscreen.placements.map((p) => ({ tile: wall.tiles.find((t) => t.id === p.tileId)!, box: p.box })),
        states,
        theme,
        catalog,
        today,
        watermark: false,
      })
    : await shareCardImage({ handle: wall.handle, title: wall.title, bio: wall.bio, placed: packInto(wall.tiles, 4, 2).map(({ item, box }) => ({ tile: item, box })), states, theme, catalog, today });
  return new Response(res.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
