import { defaultsFor, type ConnectorDef, type InputValue, type ValueType } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import type { Handle } from "@/domain/handle";
import { firstFreeSpot, WALL_COLUMNS, type Box } from "@/domain/layout";
import type { Tile, Wall } from "@/domain/wall";

/**
 * States for tiles without fetching anything: connectors answer with their
 * declared samples. Used by the landing page's demo wall and the editor's
 * widget gallery, so marketing never shows anyone's real numbers.
 */
export function sampleStates(tiles: readonly Tile[], catalog: Catalog): Record<string, TileState> {
  const states: Record<string, TileState> = {};
  for (const tile of tiles) {
    const inputs: Record<string, InputValue> = {};
    for (const [key, binding] of Object.entries(tile.inputs)) {
      if (binding.kind === "static") {
        inputs[key] = { value: binding.value, stale: false };
        continue;
      }
      const connector = catalog.connector(binding.connector);
      const value = connector?.sample[binding.metric];
      if (!connector || !value) continue;
      inputs[key] = { value, stale: false, source: { connector: connector.id, name: connector.name, verified: connector.verified } };
    }
    states[tile.id] = { status: "ready", inputs };
  }
  return states;
}

const metric = (connector: string, name: string, params: Record<string, string> = {}, connection: string | null = null) => ({
  kind: "metric" as const,
  connector,
  metric: name,
  params,
  connection,
  history: null,
});

/** The wall on the landing page. */
export function demoWall(today: string): Wall {
  const inDays = (n: number) => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const tiles: Tile[] = [
    { id: "mrr", widget: "stat", inputs: { value: metric("stripe", "mrr", {}, "demo") }, options: { label: "MRR", prefix: "", suffix: "", goal: 10000 }, visibility: "public", layout: { x: 0, y: 0, w: 2, h: 1 } },
    { id: "streak", widget: "stat", inputs: { value: metric("github", "streak", { user: "demo" }) }, options: { label: "Commit streak", prefix: "", suffix: "days" }, visibility: "public", layout: { x: 2, y: 0, w: 1, h: 1 } },
    { id: "launch", widget: "countdown", inputs: {}, options: { date: inDays(23), label: "until v2" }, visibility: "public", layout: { x: 3, y: 0, w: 1, h: 1 } },
    { id: "revenue", widget: "sparkline", inputs: { series: metric("stripe", "revenue-daily", {}, "demo") }, options: { label: "Revenue, 30 days", prefix: "" }, visibility: "public", layout: { x: 0, y: 1, w: 2, h: 1 } },
    { id: "customers", widget: "stat", inputs: { value: metric("stripe", "subscribers", {}, "demo") }, options: { label: "Customers", prefix: "", suffix: "" }, visibility: "public", layout: { x: 2, y: 1, w: 1, h: 1 } },
    { id: "year", widget: "time-left", inputs: {}, options: { period: "year", style: "bar" }, visibility: "public", layout: { x: 3, y: 1, w: 1, h: 1 } },
    { id: "graph", widget: "heatmap", inputs: { days: metric("github", "activity", { user: "demo" }) }, options: { label: "Contributions", showTotal: true }, visibility: "public", layout: { x: 0, y: 2, w: 4, h: 1 } },
    { id: "note", widget: "note", inputs: {}, options: { title: "Building Flexwall", body: "Live numbers, no screenshots." }, visibility: "public", layout: { x: 0, y: 3, w: 2, h: 1 } },
    { id: "stars", widget: "stat", inputs: { value: metric("github", "stars", { repo: "demo/demo" }) }, options: { label: "GitHub stars", prefix: "", suffix: "" }, visibility: "public", layout: { x: 2, y: 3, w: 1, h: 1 } },
    { id: "site", widget: "link", inputs: {}, options: { url: "https://flexwall.lol", title: "flexwall.lol", subtitle: "Make yours" }, visibility: "public", layout: { x: 3, y: 3, w: 1, h: 1 } },
  ];
  return {
    id: "demo",
    ownerId: "demo",
    handle: "demo" as Handle,
    title: "Ada Builds",
    bio: "Indie hacker. Shipping a SaaS in public, one commit at a time.",
    theme: "night",
    tiles,
    lockscreen: {
      device: "iphone-17-pro",
      placements: [
        { tileId: "mrr", box: { x: 0, y: 0, w: 4, h: 1 } },
        { tileId: "streak", box: { x: 0, y: 1, w: 2, h: 1 } },
        { tileId: "launch", box: { x: 2, y: 1, w: 2, h: 1 } },
        { tileId: "graph", box: { x: 0, y: 2, w: 4, h: 1 } },
      ],
    },
    lockNonce: "demo",
    published: true,
    listed: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** The widget and size an integration page uses to show each kind of value. */
const SHOWCASE: Record<ValueType, { widget: string; w: number; h: number }> = {
  number: { widget: "stat", w: 1, h: 1 },
  series: { widget: "sparkline", w: 2, h: 1 },
  calendar: { widget: "heatmap", w: 4, h: 1 },
  text: { widget: "note", w: 2, h: 1 },
};

/**
 * Example tiles for one connector: each of its metrics (up to `limit`) on the
 * widget that suits its kind of value, packed into the wall grid. Shown with
 * `sampleStates`, so integration pages and their cards never fetch anything.
 */
export function connectorShowcase(connector: ConnectorDef, catalog: Catalog, today: string, limit = 6): Tile[] {
  const placed: Box[] = [];
  const tiles: Tile[] = [];
  connector.metrics.slice(0, limit).forEach((def, i) => {
    const shape = SHOWCASE[def.type];
    const widget = catalog.widget(shape.widget);
    const input = widget?.inputs.find((x) => x.accepts.includes(def.type));
    if (!widget || !input) return;
    // The first number gets room to breathe.
    const w = def.type === "number" && i === 0 ? 2 : shape.w;
    const layout = firstFreeSpot(placed, w, shape.h, WALL_COLUMNS);
    placed.push(layout);
    tiles.push({
      id: `${connector.id}-${def.id}`,
      widget: widget.id,
      inputs: { [input.key]: { ...metric(connector.id, def.id, {}, connector.auth ? "demo" : null), params: defaultsFor(def.params ?? [], today) } },
      options: { ...defaultsFor(widget.options, today), ...(def.defaults ?? {}) },
      visibility: "public",
      layout,
    });
  });
  return tiles;
}

