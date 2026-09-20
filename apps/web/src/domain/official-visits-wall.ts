import type { Wall, Tile, Binding } from "./wall";

/** Adds page-view counters to the live official wall without removing or repositioning existing tiles. Idempotent. */
export function withOfficialVisits(wall: Wall): Wall {
  const ids = ["site-views", "wall-views"];
  if (ids.every((id) => wall.tiles.some((t) => t.id === id))) return wall;
  if (ids.some((id) => wall.tiles.some((t) => t.id === id))) throw new Error("Partial page-view counters layout already exists; review it before changing the wall.");
  const row = Math.max(0, ...wall.tiles.map((t) => t.layout.y + t.layout.h));
  const metric = (name: string): Binding => ({ kind: "metric", connector: "flexwall", metric: name, params: {}, connection: null, history: null });
  const tiles: Tile[] = [
    { id: ids[0], widget: "stat", inputs: { value: metric("siteViews") }, options: { label: "Site · page views", display: "exact" }, visibility: "public", layout: { x: 0, y: row, w: 2, h: 1 } },
    { id: ids[1], widget: "stat", inputs: { value: metric("officialWallViews") }, options: { label: "This wall · page views", display: "exact" }, visibility: "public", layout: { x: 2, y: row, w: 2, h: 1 } },
  ];
  return { ...wall, tiles: [...wall.tiles, ...tiles] };
}
