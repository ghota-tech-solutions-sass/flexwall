import { defaultsFor, type FieldValues, type Value, type ValueType, type WidgetInputDef } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import type { BrowsableCatalog } from "@/plugins/catalog";
import type { ConnectionView } from "@/domain/connection";
import { firstFreeSpot, heightOf, LOCK_COLUMNS, LOCK_ROWS, WALL_COLUMNS, type Box } from "@/domain/layout";
import type { Binding, Tile, WallDraft } from "@/domain/wall";

/**
 * Everything the editor does to a draft, as pure functions. Components call
 * these and render the result; the rules live here where they can be tested.
 */

let counter = 0;
export function newTileId(): string {
  counter = (counter + 1) % 1000;
  return `t${Date.now().toString(36)}${counter.toString(36)}`;
}

/** A source a widget input can pick, as the editor lists it. */
export interface SourceOption {
  value: string;
  label: string;
  group: string;
  pro: boolean;
}

export function staticValueFor(type: ValueType): Value {
  switch (type) {
    case "number":
      return { type: "number", value: 0 };
    case "text":
      return { type: "text", value: "" };
    case "series":
      return { type: "series", points: [] };
    case "calendar":
      return { type: "calendar", days: [] };
  }
}

/** Every way to feed an input: a typed value, a metric, or a number's history. */
export function sourcesFor(input: WidgetInputDef, catalog: BrowsableCatalog): SourceOption[] {
  const options: SourceOption[] = [];
  const typeable = input.accepts.filter((t) => t === "number" || t === "text");
  for (const t of typeable) options.push({ value: `static:${t}`, label: t === "number" ? "A number I type" : "Text I type", group: "Typed by you", pro: false });
  for (const connector of catalog.connectors()) {
    for (const metric of connector.metrics) {
      const group = connector.name;
      const pro = connector.tier === "pro";
      if (input.accepts.includes(metric.type)) options.push({ value: `metric:${connector.id}:${metric.id}`, label: metric.name, group, pro });
      if (metric.type === "number" && input.accepts.includes("series")) {
        options.push({ value: `history:${connector.id}:${metric.id}:30d`, label: `${metric.name}, 30-day history`, group, pro: true });
        options.push({ value: `history:${connector.id}:${metric.id}:90d`, label: `${metric.name}, 90-day history`, group, pro: true });
      }
    }
  }
  return options;
}

export function sourceValueOf(binding: Binding | undefined): string {
  if (!binding) return "";
  if (binding.kind === "static") return `static:${binding.value.type}`;
  return binding.history ? `history:${binding.connector}:${binding.metric}:${binding.history}` : `metric:${binding.connector}:${binding.metric}`;
}

/** The binding for a picked source, keeping params the owner already typed for the same field names. */
export function bindingFor(source: string, catalog: Catalog, connections: readonly ConnectionView[], previous?: Binding): Binding | undefined {
  const [kind, a, b, c] = source.split(":");
  if (kind === "static") return { kind: "static", value: staticValueFor(a as ValueType) };
  const connector = catalog.connector(a);
  const metric = catalog.metric(a, b);
  if (!connector || !metric) return undefined;
  const kept = previous?.kind === "metric" ? previous.params : {};
  const params: FieldValues = { ...defaultsFor(metric.params ?? []) };
  for (const f of metric.params ?? []) if (kept[f.key] !== undefined) params[f.key] = kept[f.key];
  const connection = connector.auth ? (connections.find((x) => x.connector === connector.id)?.id ?? null) : null;
  return { kind: "metric", connector: connector.id, metric: metric.id, params, connection, history: kind === "history" ? (c as "30d" | "90d") : null };
}

/** A new tile of `widgetId`, placed in the first free spot, fed by sensible defaults. */
export function addTile(draft: WallDraft, widgetId: string, catalog: BrowsableCatalog, connections: readonly ConnectionView[]): { draft: WallDraft; tileId: string } | null {
  const widget = catalog.widget(widgetId);
  if (!widget) return null;
  const [w, h] = widget.size.default;
  const layout = firstFreeSpot(
    draft.tiles.map((t) => t.layout),
    w,
    h,
    WALL_COLUMNS
  );
  const inputs: Record<string, Binding> = {};
  for (const input of widget.inputs) {
    if (input.optional) continue;
    const sources = sourcesFor(input, catalog);
    const first = sources.find((s) => !s.pro) ?? sources[0];
    const binding = first ? bindingFor(first.value, catalog, connections) : undefined;
    if (binding) inputs[input.key] = binding;
  }
  const tile: Tile = { id: newTileId(), widget: widget.id, inputs, options: defaultsFor(widget.options), visibility: "public", layout };
  return { draft: { ...draft, tiles: [...draft.tiles, tile] }, tileId: tile.id };
}

export function updateTile(draft: WallDraft, tileId: string, change: (tile: Tile) => Tile): WallDraft {
  return { ...draft, tiles: draft.tiles.map((t) => (t.id === tileId ? change(t) : t)) };
}

export function removeTile(draft: WallDraft, tileId: string): WallDraft {
  return {
    ...draft,
    tiles: draft.tiles.filter((t) => t.id !== tileId),
    lockscreen: { ...draft.lockscreen, placements: draft.lockscreen.placements.filter((p) => p.tileId !== tileId) },
  };
}

/** A copy of a tile in the first free spot, or null when the tile is gone. */
export function duplicateTile(draft: WallDraft, tileId: string): { draft: WallDraft; tileId: string } | null {
  const tile = draft.tiles.find((t) => t.id === tileId);
  if (!tile) return null;
  const layout = firstFreeSpot(
    draft.tiles.map((t) => t.layout),
    tile.layout.w,
    tile.layout.h,
    WALL_COLUMNS
  );
  const copy: Tile = { ...tile, id: newTileId(), layout };
  return { draft: { ...draft, tiles: [...draft.tiles, copy] }, tileId: copy.id };
}

/** Puts a tile back where it was, after an undo. Its lock screen placement doesn't come back. */
export function restoreTile(draft: WallDraft, tile: Tile): WallDraft {
  if (draft.tiles.some((t) => t.id === tile.id)) return draft;
  const taken = draft.tiles.some((t) => t.layout.x < tile.layout.x + tile.layout.w && tile.layout.x < t.layout.x + t.layout.w && t.layout.y < tile.layout.y + tile.layout.h && tile.layout.y < t.layout.y + t.layout.h);
  const layout = taken ? firstFreeSpot(draft.tiles.map((t) => t.layout), tile.layout.w, tile.layout.h, WALL_COLUMNS) : tile.layout;
  return { ...draft, tiles: [...draft.tiles, { ...tile, layout }] };
}

/** A freshly connected account feeds every metric of its connector still waiting for one. */
export function attachConnection(draft: WallDraft, connection: ConnectionView, known: readonly ConnectionView[]): WallDraft {
  const ids = new Set(known.map((c) => c.id));
  let changed = false;
  const tiles = draft.tiles.map((tile) => {
    let inputs = tile.inputs;
    for (const [key, binding] of Object.entries(tile.inputs)) {
      if (binding.kind !== "metric" || binding.connector !== connection.connector) continue;
      if (binding.connection && ids.has(binding.connection)) continue;
      inputs = { ...inputs, [key]: { ...binding, connection: connection.id } };
    }
    if (inputs === tile.inputs) return tile;
    changed = true;
    return { ...tile, inputs };
  });
  return changed ? { ...draft, tiles } : draft;
}

/** Tiles fed by a removed account fall back to another account of the same connector, or wait for one. */
export function detachConnection(draft: WallDraft, removed: ConnectionView, remaining: readonly ConnectionView[]): WallDraft {
  const fallback = remaining.find((c) => c.connector === removed.connector)?.id ?? null;
  let changed = false;
  const tiles = draft.tiles.map((tile) => {
    let inputs = tile.inputs;
    for (const [key, binding] of Object.entries(tile.inputs)) {
      if (binding.kind !== "metric" || binding.connection !== removed.id) continue;
      inputs = { ...inputs, [key]: { ...binding, connection: fallback } };
    }
    if (inputs === tile.inputs) return tile;
    changed = true;
    return { ...tile, inputs };
  });
  return changed ? { ...draft, tiles } : draft;
}

/** Sets an input's binding and, for a fresh metric, offers its default label to the widget. */
export function setBinding(draft: WallDraft, tileId: string, key: string, binding: Binding | undefined, catalog: Catalog): WallDraft {
  return updateTile(draft, tileId, (tile) => {
    const inputs = { ...tile.inputs };
    if (binding) inputs[key] = binding;
    else delete inputs[key];
    const options = { ...tile.options };
    const hasLabel = catalog.widget(tile.widget)?.options.some((f) => f.key === "label") ?? false;
    if (binding?.kind === "metric" && hasLabel) {
      const previous = tile.inputs[key];
      const previousDefault = previous?.kind === "metric" ? catalog.metric(previous.connector, previous.metric)?.defaults?.label : undefined;
      const next = catalog.metric(binding.connector, binding.metric)?.defaults?.label;
      if (next && (!options.label || options.label === previousDefault)) options.label = next;
    }
    return { ...tile, inputs, options };
  });
}

/** Applies positions from the grid library, ignoring anything it reports for unknown tiles. */
export function applyLayout(draft: WallDraft, layout: readonly { i: string; x: number; y: number; w: number; h: number }[]): WallDraft {
  const byId = new Map(layout.map((l) => [l.i, l]));
  let changed = false;
  const tiles = draft.tiles.map((t) => {
    const l = byId.get(t.id);
    if (!l || (l.x === t.layout.x && l.y === t.layout.y && l.w === t.layout.w && l.h === t.layout.h)) return t;
    changed = true;
    return { ...t, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
  });
  return changed ? { ...draft, tiles } : draft;
}

/** Puts a tile on the lock screen in the first free spot that fits, or says why it can't. */
export function placeOnLockscreen(draft: WallDraft, tileId: string, catalog: Catalog): { draft: WallDraft } | { error: string } {
  const tile = draft.tiles.find((t) => t.id === tileId);
  if (!tile) return { error: "That tile is gone." };
  const widget = catalog.widget(tile.widget);
  if (widget?.excludeSurfaces?.includes("lockscreen")) return { error: `${widget.name} can't go on the lock screen.` };
  const placed = draft.lockscreen.placements.map((p) => p.box);
  const w = Math.min(tile.layout.w, LOCK_COLUMNS);
  const h = Math.min(tile.layout.h, LOCK_ROWS);
  const box: Box = firstFreeSpot(placed, w, h, LOCK_COLUMNS);
  if (box.y + box.h > LOCK_ROWS) return { error: "The lock screen is full. Remove a tile or make one smaller." };
  return { draft: { ...draft, lockscreen: { ...draft.lockscreen, placements: [...draft.lockscreen.placements, { tileId, box }] } } };
}

export function removeFromLockscreen(draft: WallDraft, tileId: string): WallDraft {
  return { ...draft, lockscreen: { ...draft.lockscreen, placements: draft.lockscreen.placements.filter((p) => p.tileId !== tileId) } };
}

export function applyLockscreenLayout(draft: WallDraft, layout: readonly { i: string; x: number; y: number; w: number; h: number }[]): WallDraft {
  const placements = draft.lockscreen.placements.map((p) => {
    const l = layout.find((x) => x.i === p.tileId);
    return l ? { tileId: p.tileId, box: { x: l.x, y: l.y, w: l.w, h: Math.min(l.h, LOCK_ROWS - l.y) } } : p;
  });
  return { ...draft, lockscreen: { ...draft.lockscreen, placements } };
}

/** The part of a draft that changes what values are needed. Layout and options don't. */
export function dataSignature(draft: WallDraft): string {
  return JSON.stringify(draft.tiles.map((t) => [t.id, t.inputs]));
}

export { heightOf };
