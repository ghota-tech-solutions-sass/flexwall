import { WALL_COLUMNS, type Box } from "./layout";
import { DEFAULT_VISIBILITY, type Binding, type Tile, type Visibility, type WallDraft } from "./wall";

/**
 * Walls to start from, for owners who don't want to place tiles one by one.
 * Chosen from the editor, never forced at sign-up: what a wall is for isn't
 * obvious the minute someone picks a handle.
 *
 * Every tile here draws something without an account and without a chart
 * source: a typed number the owner types over, or words they replace. A
 * template that landed half-empty, waiting for credentials or a series, would
 * look broken on the page it was meant to fill.
 */

export interface TemplateTile {
  widget: string;
  options: Record<string, string | number | boolean>;
  /** A typed number the owner edits, for tiles that show one. */
  number?: { value: number; currency?: string };
  visibility?: Visibility;
  layout: Box;
}

export interface WallTemplate {
  id: string;
  name: string;
  /** One line: what this wall is for. */
  tagline: string;
  tiles: readonly TemplateTile[];
}

export const TEMPLATES: readonly WallTemplate[] = [
  {
    id: "indie",
    name: "Indie hacker",
    tagline: "Revenue, customers and the next launch.",
    tiles: [
      { widget: "stat", options: { label: "MRR", goal: 1000 }, number: { value: 0, currency: "usd" }, layout: { x: 0, y: 0, w: 2, h: 1 } },
      { widget: "stat", options: { label: "Customers" }, number: { value: 0 }, layout: { x: 2, y: 0, w: 2, h: 1 } },
      { widget: "countdown", options: { label: "until launch" }, layout: { x: 0, y: 1, w: 2, h: 1 } },
      { widget: "note", options: { title: "Building", body: "Say what you're shipping right now." }, layout: { x: 2, y: 1, w: 2, h: 1 } },
    ],
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "Audience, output and what you're working on.",
    tiles: [
      { widget: "stat", options: { label: "Followers" }, number: { value: 0 }, layout: { x: 0, y: 0, w: 2, h: 1 } },
      { widget: "stat", options: { label: "Posts this month" }, number: { value: 0 }, layout: { x: 2, y: 0, w: 2, h: 1 } },
      { widget: "note", options: { title: "Working on", body: "One line about what you're making." }, layout: { x: 0, y: 1, w: 2, h: 1 } },
      { widget: "link", options: { title: "Latest" }, layout: { x: 2, y: 1, w: 2, h: 1 } },
    ],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    tagline: "What you're worth, and the year going by.",
    tiles: [
      { widget: "stat", options: { label: "Net worth" }, number: { value: 0, currency: "usd" }, layout: { x: 0, y: 0, w: 2, h: 1 } },
      { widget: "stat", options: { label: "This year" }, number: { value: 0, currency: "usd" }, layout: { x: 2, y: 0, w: 2, h: 1 } },
      { widget: "time-left", options: { period: "year", style: "bar" }, layout: { x: 0, y: 1, w: 4, h: 1 } },
    ],
  },
  {
    id: "starting",
    name: "Just starting",
    tagline: "A greeting, a countdown, and room to grow.",
    tiles: [
      { widget: "note", options: { title: "Hi", body: "Say who you are in a line." }, layout: { x: 0, y: 0, w: 2, h: 1 } },
      { widget: "countdown", options: { label: "until launch" }, layout: { x: 2, y: 0, w: 2, h: 1 } },
      { widget: "time-left", options: { period: "year", style: "bar" }, layout: { x: 0, y: 1, w: 2, h: 1 } },
    ],
  },
];

/** A typed number the owner edits, for the tiles that show one. */
function startingInputs(tile: TemplateTile): Record<string, Binding> {
  if (!tile.number) return {};
  const unit = tile.number.currency ? { unit: "currency" as const, currency: tile.number.currency } : { unit: "count" as const };
  return { value: { kind: "static", value: { type: "number", value: tile.number.value, ...unit } } };
}

export function templateById(id: string): WallTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Puts a template on a wall: it replaces the tiles rather than adding to them,
 * because merging two layouts means inventing where everything goes and can
 * walk past the plan's tile limit. The editor keeps the wall it replaced, so
 * one tap undoes it.
 */
export function applyTemplate(draft: WallDraft, template: WallTemplate, newId: () => string, maxTiles: number): WallDraft {
  const tiles: Tile[] = template.tiles.slice(0, Math.max(0, maxTiles)).map((t) => ({
    id: newId(),
    widget: t.widget,
    inputs: startingInputs(t),
    options: { ...t.options },
    visibility: t.visibility ?? DEFAULT_VISIBILITY,
    layout: { ...t.layout, w: Math.min(t.layout.w, WALL_COLUMNS) },
  }));
  // The placements point at tiles that are gone: the lock screen starts empty again.
  return { ...draft, tiles, lockscreen: { ...draft.lockscreen, placements: [] } };
}
