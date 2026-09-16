import { defaultsFor, type FieldValues, type Value, type WidgetInputDef } from "@flexwall/sdk";
import type { BrowsableCatalog, Catalog } from "@/domain/catalog";
import type { ConnectionView } from "@/domain/connection";
import { firstFreeSpot, LOCK_COLUMNS, LOCK_ROWS, overlaps, packInOrder, phoneSizeBounds, readingOrder, WALL_COLUMNS, wallBoxFromPhone, type Box } from "@/domain/layout";
import { sourceKey, TYPEABLE_VALUE_TYPES, type SourceRef, type TypeableValueType } from "@/domain/source";
import { DEFAULT_VISIBILITY, HISTORY_DAYS, HISTORY_WINDOWS, type Binding, type Tile, type WallDraft } from "@/domain/wall";

/**
 * Everything the editor does to a draft, as pure functions. The editor store
 * calls these and keeps the result; the rules live here where they can be tested.
 */

/** Makes tile ids. Injected so tests get predictable ones. */
export type NewTileId = () => string;

/** Widget options that name a tile. `label` is also filled from a metric when the owner hasn't typed one. */
export const LABEL_OPTION_KEY = "label";
export const TITLE_OPTION_KEY = "title";

/** Group of the sources the owner types by hand. */
export const TYPED_SOURCE_GROUP = "Typed by you";

const TYPED_LABELS: Record<TypeableValueType, string> = { number: "A number I type", text: "Text I type" };

/** A source a widget input can pick, as the editor lists it. */
export interface SourceOption {
  ref: SourceRef;
  /** `sourceKey(ref)`, for keys and comparisons. */
  key: string;
  label: string;
  group: string;
  pro: boolean;
}

export function staticValueFor(type: TypeableValueType): Value {
  switch (type) {
    case "number":
      return { type: "number", value: 0 };
    case "text":
      return { type: "text", value: "" };
  }
}

function option(ref: SourceRef, label: string, group: string, pro: boolean): SourceOption {
  return { ref, key: sourceKey(ref), label, group, pro };
}

/** Every way to feed an input: a typed value, a metric, or a number's history. */
export function sourcesFor(input: WidgetInputDef, catalog: BrowsableCatalog, allowed?: readonly string[]): SourceOption[] {
  const options: SourceOption[] = [];
  for (const type of TYPEABLE_VALUE_TYPES) {
    if (input.accepts.includes(type)) options.push(option({ kind: "static", type }, TYPED_LABELS[type], TYPED_SOURCE_GROUP, false));
  }
  const open = allowed ? new Set(allowed) : null;
  for (const connector of catalog.connectors()) {
    // A connector paused or kept to administrators feeds no new tile.
    if (open && !open.has(connector.id)) continue;
    const pro = connector.tier === "pro";
    for (const metric of connector.metrics) {
      if (input.accepts.includes(metric.type)) options.push(option({ kind: "metric", connector: connector.id, metric: metric.id }, metric.name, connector.name, pro));
      if (metric.type !== "number" || !input.accepts.includes("series")) continue;
      // History shows on the public page with Pro, whatever the connector's tier.
      for (const window of HISTORY_WINDOWS) {
        options.push(option({ kind: "history", connector: connector.id, metric: metric.id, window }, `${metric.name}, ${HISTORY_DAYS[window]}-day history`, connector.name, true));
      }
    }
  }
  return options;
}

/** The binding for a picked source, keeping params the owner already typed for the same field names. */
export function bindingFor(ref: SourceRef, catalog: Catalog, connections: readonly ConnectionView[], previous?: Binding): Binding | undefined {
  if (ref.kind === "static") return { kind: "static", value: staticValueFor(ref.type) };
  const connector = catalog.connector(ref.connector);
  const metric = catalog.metric(ref.connector, ref.metric);
  if (!connector || !metric) return undefined;
  const kept = previous?.kind === "metric" ? previous.params : {};
  const params: FieldValues = { ...defaultsFor(metric.params ?? []) };
  for (const f of metric.params ?? []) if (kept[f.key] !== undefined) params[f.key] = kept[f.key];
  const connection = connector.auth ? (connections.find((x) => x.connector === connector.id)?.id ?? null) : null;
  return { kind: "metric", connector: connector.id, metric: metric.id, params, connection, history: ref.kind === "history" ? ref.window : null };
}

/** The cell under a point of the wall grid, for a tile `w` wide dropped with its top-left corner there. */
export function dropCell(point: { x: number; y: number }, grid: { cell: number; gap: number; columns: number }, w: number): { x: number; y: number } {
  const pitch = grid.cell + grid.gap;
  const x = Math.min(Math.max(0, Math.floor(point.x / pitch)), grid.columns - w);
  const y = Math.max(0, Math.floor(point.y / pitch));
  return { x, y };
}

/**
 * A new tile of `widgetId`, fed by sensible defaults: in the first free spot,
 * or at the cell it was dropped on, kept inside the wall's columns.
 */
export function addTile(
  draft: WallDraft,
  widgetId: string,
  catalog: BrowsableCatalog,
  connections: readonly ConnectionView[],
  newId: NewTileId,
  at?: { x: number; y: number },
  allowed?: readonly string[]
): { draft: WallDraft; tileId: string } | null {
  const widget = catalog.widget(widgetId);
  if (!widget) return null;
  const [w, h] = widget.size.default;
  const layout = at
    ? { x: Math.min(Math.max(0, Math.round(at.x)), WALL_COLUMNS - w), y: Math.max(0, Math.round(at.y)), w, h }
    : firstFreeSpot(
        draft.tiles.map((t) => t.layout),
        w,
        h,
        WALL_COLUMNS
      );
  const inputs: Record<string, Binding> = {};
  for (const input of widget.inputs) {
    if (input.optional) continue;
    const sources = sourcesFor(input, catalog, allowed);
    const first = sources.find((s) => !s.pro) ?? sources[0];
    const binding = first ? bindingFor(first.ref, catalog, connections) : undefined;
    if (binding) inputs[input.key] = binding;
  }
  const tile: Tile = { id: newId(), widget: widget.id, inputs, options: defaultsFor(widget.options), visibility: DEFAULT_VISIBILITY, layout };
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
export function duplicateTile(draft: WallDraft, tileId: string, newId: NewTileId): { draft: WallDraft; tileId: string } | null {
  const tile = draft.tiles.find((t) => t.id === tileId);
  if (!tile) return null;
  const layout = firstFreeSpot(
    draft.tiles.map((t) => t.layout),
    tile.layout.w,
    tile.layout.h,
    WALL_COLUMNS
  );
  const copy: Tile = { ...tile, id: newId(), layout };
  return { draft: { ...draft, tiles: [...draft.tiles, copy] }, tileId: copy.id };
}

/** Puts a tile back where it was, after an undo, or in the first free spot if that place was taken. Its lock screen placement doesn't come back. */
export function restoreTile(draft: WallDraft, tile: Tile): WallDraft {
  if (draft.tiles.some((t) => t.id === tile.id)) return draft;
  const layout = draft.tiles.some((t) => overlaps(t.layout, tile.layout))
    ? firstFreeSpot(
        draft.tiles.map((t) => t.layout),
        tile.layout.w,
        tile.layout.h,
        WALL_COLUMNS
      )
    : tile.layout;
  return { ...draft, tiles: [...draft.tiles, { ...tile, layout }] };
}

type MetricBinding = Extract<Binding, { kind: "metric" }>;

/** Gives metric inputs a new connection where `next` returns one; `undefined` leaves the input alone. */
function rebind(draft: WallDraft, next: (binding: MetricBinding) => string | null | undefined): WallDraft {
  let changed = false;
  const tiles = draft.tiles.map((tile) => {
    let inputs = tile.inputs;
    for (const [key, binding] of Object.entries(tile.inputs)) {
      if (binding.kind !== "metric") continue;
      const connection = next(binding);
      if (connection === undefined) continue;
      inputs = { ...inputs, [key]: { ...binding, connection } };
    }
    if (inputs === tile.inputs) return tile;
    changed = true;
    return { ...tile, inputs };
  });
  return changed ? { ...draft, tiles } : draft;
}

/** A freshly connected account feeds every metric of its connector still waiting for one. */
export function attachConnection(draft: WallDraft, connection: ConnectionView, known: readonly ConnectionView[]): WallDraft {
  const ids = new Set(known.map((c) => c.id));
  const waiting = (b: MetricBinding) => b.connector === connection.connector && !(b.connection && ids.has(b.connection));
  return rebind(draft, (b) => (waiting(b) ? connection.id : undefined));
}

/** Tiles fed by a removed account fall back to another account of the same connector, or wait for one. */
export function detachConnection(draft: WallDraft, removed: ConnectionView, remaining: readonly ConnectionView[]): WallDraft {
  const fallback = remaining.find((c) => c.connector === removed.connector)?.id ?? null;
  return rebind(draft, (b) => (b.connection === removed.id ? fallback : undefined));
}

/** Points one input at an account. */
export function setConnection(draft: WallDraft, tileId: string, key: string, connectionId: string): WallDraft {
  return updateTile(draft, tileId, (tile) => {
    const binding = tile.inputs[key];
    if (binding?.kind !== "metric") return tile;
    return { ...tile, inputs: { ...tile.inputs, [key]: { ...binding, connection: connectionId } } };
  });
}

/** Sets an input's binding and, for a fresh metric, offers its default label to the widget. */
export function setBinding(draft: WallDraft, tileId: string, key: string, binding: Binding | undefined, catalog: Catalog): WallDraft {
  return updateTile(draft, tileId, (tile) => {
    const inputs = { ...tile.inputs };
    if (binding) inputs[key] = binding;
    else delete inputs[key];
    const options = { ...tile.options };
    const hasLabel = catalog.widget(tile.widget)?.options.some((f) => f.key === LABEL_OPTION_KEY) ?? false;
    if (binding?.kind === "metric" && hasLabel) {
      const previous = tile.inputs[key];
      const previousDefault = previous?.kind === "metric" ? catalog.metric(previous.connector, previous.metric)?.defaults?.label : undefined;
      const next = catalog.metric(binding.connector, binding.metric)?.defaults?.label;
      if (next && (!options[LABEL_OPTION_KEY] || options[LABEL_OPTION_KEY] === previousDefault)) options[LABEL_OPTION_KEY] = next;
    }
    return { ...tile, inputs, options };
  });
}

/** Applies positions from the grid library, ignoring anything it reports for unknown tiles. */
export function applyLayout(draft: WallDraft, layout: readonly ({ i: string } & Box)[]): WallDraft {
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

/**
 * A wall rearranged from the phone's two columns. The phone shows the same wall
 * folded in two, so what it gives back is an order and a size per tile; the
 * stored four-column layout is packed from that order, keeping it readable the
 * same way on both. Unchanged arrangements return the very same draft, so
 * nothing is saved and nothing refetched.
 */
export function applyPhoneLayout(draft: WallDraft, layout: readonly ({ i: string } & Box)[], catalog: Catalog): WallDraft {
  const phone = new Map(layout.map((l) => [l.i, l]));
  const ordered = readingOrder(draft.tiles.flatMap((t) => (phone.has(t.id) ? [{ tile: t, layout: phone.get(t.id)! }] : [])));
  const wall = ordered.map(({ tile, layout: onPhone }) => ({ tile, layout: wallBoxFromPhone(tile.layout, sizedForWall(tile, onPhone, catalog)) }));
  const packed = packInOrder(wall, WALL_COLUMNS);
  return applyLayout(
    draft,
    packed.map((p) => ({ i: p.item.tile.id, ...p.box }))
  );
}

/** Keeps a phone size inside what the widget allows once it's back on the wall. */
function sizedForWall(tile: Tile, onPhone: Box, catalog: Catalog): { w: number; h: number } {
  const size = catalog.widget(tile.widget)?.size;
  if (!size) return { w: onPhone.w, h: onPhone.h };
  const bounds = phoneSizeBounds(size);
  return { w: clamp(onPhone.w, bounds.minW, bounds.maxW), h: clamp(onPhone.h, bounds.minH, bounds.maxH) };
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

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

/** Applies lock screen positions from the grid library, clipped to the rows the band has. Unchanged positions keep the draft as is. */
export function applyLockscreenLayout(draft: WallDraft, layout: readonly ({ i: string } & Box)[]): WallDraft {
  let changed = false;
  const placements = draft.lockscreen.placements.map((p) => {
    const l = layout.find((x) => x.i === p.tileId);
    if (!l) return p;
    const box = { x: l.x, y: l.y, w: l.w, h: Math.min(l.h, LOCK_ROWS - l.y) };
    if (box.x === p.box.x && box.y === p.box.y && box.w === p.box.w && box.h === p.box.h) return p;
    changed = true;
    return { tileId: p.tileId, box };
  });
  return changed ? { ...draft, lockscreen: { ...draft.lockscreen, placements } } : draft;
}

/** The part of a draft that changes what values are needed. Layout and options don't. */
export function dataSignature(draft: WallDraft): string {
  return JSON.stringify(draft.tiles.map((t) => [t.id, t.inputs]));
}

/** The name a tile goes by in lists: its label or title when it has one, else its widget's name. */
export function tileName(tile: Tile, catalog: Catalog): string {
  const own = tile.options[LABEL_OPTION_KEY] || tile.options[TITLE_OPTION_KEY];
  return own ? String(own) : (catalog.widget(tile.widget)?.name ?? tile.widget);
}

/** The accounts feeding a tile, once each, in the order of its inputs. */
export function tileConnections(tile: Tile): string[] {
  const ids = Object.values(tile.inputs).flatMap((b) => (b.kind === "metric" && b.connection ? [b.connection] : []));
  return [...new Set(ids)];
}

/** A tile as account lists name it. */
export interface TileRef {
  id: string;
  name: string;
}

/** The tiles an account feeds, in wall order, so the owner sees what removing or renaming it touches. */
export function tilesUsing(connectionId: string, tiles: readonly Tile[], catalog: Catalog): TileRef[] {
  return tiles.filter((t) => tileConnections(t).includes(connectionId)).map((t) => ({ id: t.id, name: tileName(t, catalog) }));
}
