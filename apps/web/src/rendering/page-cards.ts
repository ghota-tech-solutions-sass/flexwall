import { catalog } from "@/plugins/registry";
import { DISPLAY_TIME_ZONE, todayIn } from "@/domain/time";
import { CARD_SIZE, pageCardImage, placeOnCard } from "./images";
import { connectorShowcase, demoWall, sampleStates } from "./samples";

/** Social cards for site pages, drawn from sample data only. */

export { CARD_SIZE };

/** A site page's card over the demo wall's first two rows. */
export function demoPageCard(text: { kicker: string; title: string; body: string }) {
  const today = todayIn(DISPLAY_TIME_ZONE, Date.now());
  const wall = demoWall(today);
  const placed = placeOnCard(wall.tiles);
  return pageCardImage({ ...text, placed, states: sampleStates(wall.tiles, catalog), theme: catalog.theme(wall.theme)!, catalog: catalog, today });
}

/** An integration's card over example tiles of that connector. Null for an unknown connector. */
export function integrationCard(connectorId: string, text: { kicker: string; title: string; body: string }) {
  const connector = catalog.connector(connectorId);
  if (!connector) return null;
  const today = todayIn(DISPLAY_TIME_ZONE, Date.now());
  const tiles = connectorShowcase(connector, catalog, today);
  const placed = placeOnCard(tiles);
  return pageCardImage({ ...text, placed, states: sampleStates(tiles, catalog), theme: catalog.defaultTheme(), catalog: catalog, today });
}
