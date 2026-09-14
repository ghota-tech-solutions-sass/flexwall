import { container } from "@/composition";
import { effectiveTheme } from "@/domain/wall";
import { CARD_SIZE, placeOnCard, shareCardImage } from "@/rendering/images";

export const alt = "A Flexwall wall";
export const size = CARD_SIZE;
export const contentType = "image/png";

/** The card X and Slack unfold: the wall's first two rows of public tiles, live. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const c = container();
  const { wall, owner, entitlements } = await c.getPublicWall.execute({ handle: (await params).handle });
  const placed = placeOnCard(wall.tiles);
  const { states, today } = await c.resolveWall.execute({ tiles: placed.map((p) => p.tile), owner, surface: "card" });
  return shareCardImage({ handle: wall.handle, title: wall.title, bio: wall.bio, placed, states, theme: effectiveTheme(wall, c.catalog, entitlements), catalog: c.catalog, today });
}
