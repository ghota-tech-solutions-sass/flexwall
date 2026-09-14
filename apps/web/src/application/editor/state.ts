import type { TileState } from "@/application/use-cases/resolve-wall";
import type { ConnectionView } from "@/domain/connection";
import type { Handle } from "@/domain/handle";
import type { Entitlements } from "@/domain/user";
import type { Tile, Wall, WallDraft } from "@/domain/wall";

/** What the editor shows the wall on. */
export const EDITOR_SURFACES = ["wall", "lockscreen"] as const;
export type EditorSurface = (typeof EDITOR_SURFACES)[number];
export const DEFAULT_SURFACE: EditorSurface = "wall";

/** How long the editor waits, in milliseconds. */
export const EDITOR_TIMINGS = {
  /** After the last change, before saving: typing a title saves once. */
  autosaveMs: 900,
  /** After a binding changes, before asking for fresh values. */
  resolveMs: 350,
  /** How long a deleted tile can be brought back. */
  undoMs: 6000,
} as const;

export type SaveStatus = { kind: "saved" } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string };

export interface EditorState {
  handle: Handle;
  entitlements: Entitlements;
  draft: WallDraft;
  selected: string | null;
  surface: EditorSurface;
  save: SaveStatus;
  /** Resolved values by tile id. Empty until the first answer. */
  states: Record<string, TileState>;
  today: string;
  connections: ConnectionView[];
  /** The last deleted tile, while it can still be brought back. */
  removed: Tile | null;
  /** Bumped when the owner asks to connect an account from a tile, so its form takes focus. */
  connectRequest: { tileId: string; count: number } | null;
  lockscreenPath: string;
  lockscreenError: string | null;
}

/** What the page hands the editor on load. */
export type EditorInit = Pick<EditorState, "handle" | "entitlements" | "draft" | "connections" | "lockscreenPath" | "today">;

export function initialState(init: EditorInit): EditorState {
  return {
    ...init,
    selected: null,
    surface: DEFAULT_SURFACE,
    save: { kind: "saved" },
    states: {},
    removed: null,
    connectRequest: null,
    lockscreenError: null,
  };
}

/** The part of a wall the owner edits. */
export function draftOf(wall: Wall): WallDraft {
  return { title: wall.title, bio: wall.bio, theme: wall.theme, tiles: wall.tiles, lockscreen: wall.lockscreen, published: wall.published, listed: wall.listed };
}
