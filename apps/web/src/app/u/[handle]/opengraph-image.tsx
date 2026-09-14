import { container } from "@/composition";
import { packInto } from "@/domain/layout";
import { effectiveTheme } from "@/domain/wall";
import { shareCardImage } from "@/rendering/images";

export const alt = "A Flexwall wall";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card X and Slack unfold: the wall's first two rows of public tiles, live. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const c = container();
  const { wall, owner, entitlements } = await c.getPublicWall.execute({ handle: (await params).handle });
  const placed = packInto(wall.tiles, 4, 2).map(({ item, box }) => ({ tile: item, box }));
  const { states, today } = await c.resolveWall.execute({ tiles: placed.map((p) => p.tile), owner, surface: "card" });
  return shareCardImage({ handle: wall.handle, title: wall.title, bio: wall.bio, placed, states, theme: effectiveTheme(wall, c.catalog, entitlements), catalog: c.catalog, today });
}
