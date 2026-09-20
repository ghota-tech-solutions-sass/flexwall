import type { Wall, Tile, Binding } from "./wall";

/** Adds Stripe to the live official wall without removing or repositioning existing tiles. Idempotent. */
export function withOfficialStripe(wall: Wall): Wall {
  const ids = ["stripe-mrr", "stripe-subscribers", "stripe-revenue"];
  if (ids.every((id) => wall.tiles.some((t) => t.id === id))) return wall;
  if (ids.some((id) => wall.tiles.some((t) => t.id === id))) throw new Error("Partial Stripe layout already exists; review it before changing the wall.");
  const row = Math.max(0, ...wall.tiles.map((t) => t.layout.y + t.layout.h));
  const metric = (name: string): Binding => ({ kind: "metric", connector: "flexwall-stripe", metric: name, params: {}, connection: null, history: null });
  const tiles: Tile[] = [
    { id: ids[0], widget: "stat", inputs: { value: metric("mrr") }, options: { label: "MRR · Flexwall", display: "exact" }, visibility: "public", layout: { x: 0, y: row, w: 2, h: 1 } },
    { id: ids[1], widget: "stat", inputs: { value: metric("subscribers") }, options: { label: "Active subscriptions", display: "exact" }, visibility: "public", layout: { x: 2, y: row, w: 2, h: 1 } },
    { id: ids[2], widget: "bar-chart", inputs: { series: metric("revenue-daily") }, options: { label: "Revenue, 30 days · before fees", display: "exact", summary: "sum" }, visibility: "public", layout: { x: 0, y: row + 1, w: 4, h: 1 } },
  ];
  return { ...wall, tiles: [...wall.tiles, ...tiles] };
}
