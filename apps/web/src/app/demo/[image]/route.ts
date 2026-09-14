import { container } from "@/composition";
import { packInto } from "@/domain/layout";
import { todayIn } from "@/domain/time";
import { lockscreenImage, shareCardImage } from "@/rendering/images";
import { demoWall, sampleStates } from "@/rendering/samples";

/** Images of the demo wall for the landing page. Sample numbers only; cacheable by anyone. */
export async function GET(_req: Request, { params }: { params: Promise<{ image: string }> }) {
  const { image } = await params;
  const c = container();
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  const theme = c.catalog.theme(wall.theme)!;
  const states = sampleStates(wall.tiles, c.catalog);
  let res: Response;
  if (image === "lockscreen.png") {
    const placed = wall.lockscreen.placements.map((p) => ({ tile: wall.tiles.find((t) => t.id === p.tileId)!, box: p.box }));
    res = await lockscreenImage({ device: "iphone-17-pro", placed, states, theme, catalog: c.catalog, today, watermark: false, width: 603 });
  } else if (image === "card.png") {
    const placed = packInto(wall.tiles, 4, 2).map(({ item, box }) => ({ tile: item, box }));
    res = await shareCardImage({ handle: wall.handle, title: wall.title, bio: wall.bio, placed, states, theme, catalog: c.catalog, today });
  } else {
    return new Response("not_found", { status: 404 });
  }
  return new Response(res.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
