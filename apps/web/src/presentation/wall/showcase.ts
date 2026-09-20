import { firstFreeSpot, type Box } from "@/domain/layout";
import type { Tile } from "@/domain/wall";

/** One composition for the homepage and interactive demo, using the real widget renderers. */
export const SHOWCASE_IDS = ["mrr", "streak", "customers", "revenue", "graph"] as const;

export function showcaseTiles(tiles: readonly Tile[], { hidden = [], chartType = "bar-chart" }: { hidden?: readonly string[]; chartType?: string } = {}): Tile[] {
  const placed: Box[] = [];
  return SHOWCASE_IDS.flatMap((id) => tiles.filter((tile) => tile.id === id))
    .filter((tile) => !hidden.includes(tile.id))
    .map((tile) => {
      const w = ["revenue", "graph"].includes(tile.id) ? 4 : 2;
      const layout = firstFreeSpot(placed, w, tile.id === "mrr" ? 2 : 1, 4);
      placed.push(layout);
      return { ...tile, ...(tile.id === "revenue" ? { widget: chartType, options: { ...tile.options, summary: "sum" } } : tile.id === "mrr" ? { widget: "goal-ring", options: { ...tile.options, goal: 10000 } } : {}), layout };
    });
}
