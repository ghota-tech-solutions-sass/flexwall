import { catalog } from "@/plugins/registry";
import { packInto } from "@/domain/layout";
import { todayIn } from "@/domain/time";
import { pageCardImage } from "./images";
import { connectorShowcase, demoWall, sampleStates } from "./samples";

/** Social cards for site pages, drawn from sample data only. */

export const CARD_SIZE = { width: 1200, height: 630 };

/** A site page's card over the demo wall's first two rows. */
export function demoPageCard(text: { kicker: string; title: string; body: string }) {
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  const placed = packInto(wall.tiles, 4, 2).map(({ item, box }) => ({ tile: item, box }));
  return pageCardImage({ ...text, placed, states: sampleStates(wall.tiles, catalog), theme: catalog.theme(wall.theme)!, catalog: catalog, today });
}

/** An integration's card over example tiles of that connector. Null for an unknown connector. */
export function integrationCard(connectorId: string, text: { kicker: string; title: string; body: string }) {
  const connector = catalog.connector(connectorId);
  if (!connector) return null;
  const today = todayIn("UTC", Date.now());
  const tiles = connectorShowcase(connector, catalog, today);
  const placed = packInto(tiles, 4, 2).map(({ item, box }) => ({ tile: item, box }));
  return pageCardImage({ ...text, placed, states: sampleStates(tiles, catalog), theme: catalog.defaultTheme(), catalog: catalog, today });
}
