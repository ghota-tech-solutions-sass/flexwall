import { defaultsFor, isValue, validateFields, type FieldValues, type Value, type ValueType } from "@flexwall/sdk";
import type { Catalog } from "./catalog";
import type { Connection } from "./connection";
import { DomainError } from "./errors";
import type { Handle } from "./handle";
import { DEFAULT_DEVICE, DEVICE_IDS, firstOverlap, fitsColumns, LOCK_COLUMNS, LOCK_ROWS, WALL_COLUMNS, type Box, type DeviceId } from "./layout";
import type { Entitlements } from "./user";

/** How far back a number's daily snapshots go when shown as a series. */
export const HISTORY_WINDOWS = ["30d", "90d"] as const;
export type HistoryWindow = (typeof HISTORY_WINDOWS)[number];
export const HISTORY_DAYS: Record<HistoryWindow, number> = { "30d": 30, "90d": 90 };

export function isHistoryWindow(value: unknown): value is HistoryWindow {
  return HISTORY_WINDOWS.includes(value as HistoryWindow);
}

/** Where a tile input's value comes from. */
export type Binding =
  | {
      kind: "metric";
      connector: string;
      metric: string;
      params: FieldValues;
      /** Required for connectors with auth; must be one of the owner's connections. */
      connection: string | null;
      /** A number metric's daily snapshots, as a series. Pro. */
      history: HistoryWindow | null;
    }
  | { kind: "static"; value: Value };

export const VISIBILITIES = ["public", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const DEFAULT_VISIBILITY: Visibility = "public";

export interface Tile {
  id: string;
  widget: string;
  inputs: Record<string, Binding>;
  options: FieldValues;
  visibility: Visibility;
  layout: Box;
}

export interface LockscreenPlacement {
  tileId: string;
  box: Box;
}

export interface Wall {
  id: string;
  ownerId: string;
  handle: Handle;
  title: string;
  bio: string;
  theme: string;
  tiles: Tile[];
  lockscreen: { device: DeviceId; placements: LockscreenPlacement[] };
  /** Rotating it kills the lock screen image link. */
  lockNonce: string;
  /** The page is reachable at /@handle. */
  published: boolean;
  /** The wall appears on Explore. */
  listed: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What the editor sends. Everything is re-validated; nothing is trusted. */
export interface WallDraft {
  title: string;
  bio: string;
  theme: string;
  tiles: Tile[];
  lockscreen: { device: string; placements: LockscreenPlacement[] };
  published: boolean;
  listed: boolean;
}

export const TITLE_MAX = 60;
export const BIO_MAX = 280;
/** Longest text an owner types into a tile. */
export const STATIC_TEXT_MAX = 280;
export const TILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
/** The theme new walls start with, and the one Pro themes fall back to without Pro. */
export const DEFAULT_THEME_ID = "daylight";

export interface WallRules {
  catalog: Catalog;
  entitlements: Entitlements;
  /** The owner's connections. */
  connections: readonly Connection[];
}

/** The type a binding produces once resolved. */
export function bindingType(binding: Binding, catalog: Catalog): ValueType | null {
  if (binding.kind === "static") return binding.value.type;
  const metric = catalog.metric(binding.connector, binding.metric);
  if (!metric) return null;
  return binding.history ? "series" : metric.type;
}

/** Names a tile the way the owner sees it: by widget and position, never by internal id. */
function describe(tile: Tile, catalog: Catalog): string {
  const name = catalog.widget(tile.widget)?.name ?? "A";
  const where = tile.layout ? ` at row ${Number(tile.layout.y) + 1}, column ${Number(tile.layout.x) + 1}` : "";
  return `The ${name} tile${where}`;
}

function fail(where: string | null, message: string): never {
  throw new DomainError("invalid_wall", where ? `${where}: ${message}` : message);
}

function sanitizeBinding(tile: string, key: string, accepts: readonly ValueType[], binding: Binding, rules: WallRules): Binding {
  if (binding.kind === "static") {
    if (!isValue(binding.value)) fail(tile, `"${key}" has a value the widget can't read.`);
    if (!accepts.includes(binding.value.type)) fail(tile, `"${key}" takes ${accepts.join(" or ")}, not ${binding.value.type}.`);
    if (binding.value.type === "text" && binding.value.value.length > STATIC_TEXT_MAX) fail(tile, `"${key}" is longer than ${STATIC_TEXT_MAX} characters.`);
    return { kind: "static", value: binding.value };
  }
  const connector = rules.catalog.connector(binding.connector);
  if (!connector) fail(tile, `connector "${binding.connector}" isn't installed.`);
  const metric = rules.catalog.metric(binding.connector, binding.metric);
  if (!metric) fail(tile, `${connector.name} has no metric "${binding.metric}".`);
  const history = isHistoryWindow(binding.history) ? binding.history : null;
  if (history && metric.type !== "number") fail(tile, "only numbers have a history.");
  const produced = history ? "series" : metric.type;
  if (!accepts.includes(produced)) fail(tile, `"${key}" takes ${accepts.join(" or ")}, ${metric.name} gives ${produced}.`);
  const params = validateFields(metric.params ?? [], binding.params ?? {});
  if (params.error) fail(tile, params.error);

  let connection: string | null = null;
  if (connector.auth) {
    // Unconnected is allowed: the tile shows "Connect Stripe" until it is.
    if (binding.connection) {
      const owned = rules.connections.find((c) => c.id === binding.connection);
      if (!owned || owned.connector !== connector.id) fail(tile, `that ${connector.name} connection isn't yours.`);
      connection = owned.id;
    }
  }
  return { kind: "metric", connector: connector.id, metric: metric.id, params: params.values, connection, history };
}

function sanitizeTile(raw: Tile, rules: WallRules): Tile {
  if (!raw || typeof raw.id !== "string" || !TILE_ID_PATTERN.test(raw.id)) fail(null, "A tile has no valid id.");
  const where = describe(raw, rules.catalog);
  const widget = rules.catalog.widget(raw.widget);
  if (!widget) fail(where, `widget "${raw.widget}" isn't installed.`);

  const layout = { x: Number(raw.layout?.x), y: Number(raw.layout?.y), w: Number(raw.layout?.w), h: Number(raw.layout?.h) };
  if (!fitsColumns(layout, WALL_COLUMNS)) fail(where, "it's outside the grid.");
  const [minW, minH] = widget.size.min;
  const [maxW, maxH] = widget.size.max;
  if (layout.w < minW || layout.h < minH || layout.w > maxW || layout.h > maxH) {
    fail(where, `${widget.name} fits between ${minW}×${minH} and ${maxW}×${maxH}.`);
  }

  const options = validateFields(widget.options, { ...defaultsFor(widget.options), ...(raw.options ?? {}) });
  if (options.error) fail(where, options.error);

  const inputs: Record<string, Binding> = {};
  for (const input of widget.inputs) {
    const binding = raw.inputs?.[input.key];
    if (!binding) {
      if (input.optional) continue;
      fail(where, `${widget.name} needs "${input.label}".`);
    }
    inputs[input.key] = sanitizeBinding(where, input.key, input.accepts, binding, rules);
  }

  return { id: raw.id, widget: widget.id, inputs, options: options.values, visibility: VISIBILITIES.includes(raw.visibility) ? raw.visibility : "private", layout };
}

/**
 * Turns an editor draft into wall content the domain vouches for: every
 * widget installed, every size allowed, every option valid, every binding
 * typed and owned, no overlaps, within the plan's tile limit.
 */
export function applyDraft(wall: Wall, draft: WallDraft, rules: WallRules, now: number): Wall {
  const title = String(draft.title ?? "").trim();
  const bio = String(draft.bio ?? "").trim();
  if (title.length > TITLE_MAX) fail(null, `The title is longer than ${TITLE_MAX} characters.`);
  if (bio.length > BIO_MAX) fail(null, `The bio is longer than ${BIO_MAX} characters.`);
  if (!rules.catalog.theme(draft.theme)) fail(null, `Theme "${draft.theme}" isn't installed.`);

  const rawTiles = Array.isArray(draft.tiles) ? draft.tiles : [];
  if (rawTiles.length > rules.entitlements.maxTiles) {
    throw new DomainError(
      "plan_limit",
      rules.entitlements.paid
        ? `A wall holds ${rules.entitlements.maxTiles} tiles at most.`
        : `Free walls hold ${rules.entitlements.maxTiles} tiles. Go Pro for more.`
    );
  }
  const tiles = rawTiles.map((t) => sanitizeTile(t, rules));
  const ids = new Set<string>();
  for (const t of tiles) {
    if (ids.has(t.id)) fail(describe(t, rules.catalog), "two tiles share this id.");
    ids.add(t.id);
  }
  const clash = firstOverlap(tiles.map((t) => t.layout));
  if (clash) fail(describe(tiles[clash[1]], rules.catalog), `it overlaps ${describe(tiles[clash[0]], rules.catalog).replace(/^The/, "the")}.`);

  const device = (DEVICE_IDS as string[]).includes(draft.lockscreen?.device) ? (draft.lockscreen.device as DeviceId) : wall.lockscreen.device;
  const placements: LockscreenPlacement[] = [];
  for (const p of draft.lockscreen?.placements ?? []) {
    const tile = tiles.find((t) => t.id === p.tileId);
    if (!tile) continue; // the tile was removed from the wall
    const box = { x: Number(p.box?.x), y: Number(p.box?.y), w: Number(p.box?.w), h: Number(p.box?.h) };
    if (!fitsColumns(box, LOCK_COLUMNS) || box.y + box.h > LOCK_ROWS) fail(describe(tile, rules.catalog), "its lock screen spot is outside the screen.");
    const widget = rules.catalog.widget(tile.widget)!;
    if (widget.excludeSurfaces?.includes("lockscreen")) fail(describe(tile, rules.catalog), `${widget.name} can't go on the lock screen.`);
    placements.push({ tileId: tile.id, box });
  }
  const lockClash = firstOverlap(placements.map((p) => p.box));
  if (lockClash) fail(null, "Two tiles overlap on the lock screen.");

  return {
    ...wall,
    title,
    bio,
    theme: draft.theme,
    tiles,
    lockscreen: { device, placements },
    published: Boolean(draft.published),
    listed: Boolean(draft.published && draft.listed),
    updatedAt: now,
  };
}

/** Tiles strangers may see. */
export function publicTiles(wall: Pick<Wall, "tiles">): Tile[] {
  return wall.tiles.filter((t) => t.visibility === "public");
}

/** The theme a wall is drawn with: Pro themes need a paid owner. */
export function effectiveTheme(wall: Pick<Wall, "theme">, catalog: Catalog, entitlements: Entitlements) {
  const theme = catalog.theme(wall.theme) ?? catalog.defaultTheme();
  return theme.tier === "pro" && !entitlements.proThemes ? catalog.defaultTheme() : theme;
}

/** A wall to start from: enough to look alive, nothing that needs an account. */
export function newWall(input: { id: string; owner: { id: string; handle: Handle }; lockNonce: string; now: number; today: string }): Wall {
  const inMonths = (n: number) => {
    const d = new Date(input.today + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };
  const tiles: Tile[] = [
    { id: "hello", widget: "note", inputs: {}, options: { title: "Hi, I'm building things", body: "Edit this wall: drag tiles, resize them, connect your accounts." }, visibility: "public", layout: { x: 0, y: 0, w: 2, h: 1 } },
    { id: "year", widget: "time-left", inputs: {}, options: { period: "year", style: "bar" }, visibility: "public", layout: { x: 2, y: 0, w: 2, h: 1 } },
    { id: "launch", widget: "countdown", inputs: {}, options: { date: inMonths(1), label: "until launch" }, visibility: "public", layout: { x: 0, y: 1, w: 1, h: 1 } },
    {
      id: "goal",
      widget: "stat",
      inputs: { value: { kind: "static", value: { type: "number", value: 0, unit: "currency", currency: "usd" } } },
      options: { label: "MRR", prefix: "", suffix: "", goal: 1000 },
      visibility: "private",
      layout: { x: 1, y: 1, w: 3, h: 1 },
    },
  ];
  return {
    id: input.id,
    ownerId: input.owner.id,
    handle: input.owner.handle,
    title: `@${input.owner.handle}`,
    bio: "",
    theme: DEFAULT_THEME_ID,
    tiles,
    lockscreen: { device: DEFAULT_DEVICE, placements: [{ tileId: "year", box: { x: 0, y: 0, w: 4, h: 1 } }] },
    lockNonce: input.lockNonce,
    published: false,
    listed: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
