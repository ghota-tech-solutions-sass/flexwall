import type { FieldValues } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { BrowsableCatalog } from "@/domain/catalog";
import type { ConnectionView } from "@/domain/connection";
import type { Tile, WallDraft } from "@/domain/wall";
import type { NewTileId } from "./draft";

/**
 * What the editor needs from outside the browser tab. The HTTP adapter
 * implements it in the app; tests pass fakes and drive time by hand.
 */

/** A call that either worked or says, in the owner's words, why not. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

export interface Resolution {
  states: Record<string, TileState>;
  today: string;
}

/** Connected accounts, managed from the editor and from settings. */
export interface AccountsGateway {
  connectAccount(connector: string, values: FieldValues): Promise<Outcome<ConnectionView>>;
  /** Starts signing in at a provider. Resolves to the address to send the browser to; it comes back to `returnTo`. */
  startSignIn(connector: string, values: FieldValues, returnTo: string): Promise<Outcome<string>>;
  removeAccount(connectionId: string): Promise<Outcome<void>>;
  /** Names an account; null or an empty name clears it. Resolves to the account as saved. */
  renameAccount(connectionId: string, nickname: string | null): Promise<Outcome<ConnectionView>>;
}

export interface EditorGateway extends AccountsGateway {
  saveWall(draft: WallDraft): Promise<Outcome<void>>;
  resolveTiles(tiles: readonly Tile[]): Promise<Outcome<Resolution>>;
  /** Makes a new lock screen link; the old one stops working. Resolves to its path. */
  rotateLockscreenLink(): Promise<Outcome<string>>;
}

/** Runs `run` after `ms` milliseconds. Returns a function that cancels it. */
export interface Scheduler {
  schedule(ms: number, run: () => void): () => void;
}

export interface EditorDeps {
  gateway: EditorGateway;
  scheduler: Scheduler;
  catalog: BrowsableCatalog;
  newTileId: NewTileId;
}
