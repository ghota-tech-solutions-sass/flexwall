import type { AccountsGateway, EditorDeps } from "@/application/editor/ports";
import { timerScheduler } from "@/infrastructure/browser/scheduler";
import { HttpEditorGateway } from "@/infrastructure/http/editor-gateway";
import { catalog } from "@/plugins/registry";

/**
 * The browser's composition root for the editor: the one place that picks
 * implementations for its ports. Components get a store built from these.
 */
export function editorDeps(): EditorDeps {
  return {
    gateway: new HttpEditorGateway((input, init) => fetch(input, init)),
    scheduler: timerScheduler,
    catalog,
    // UUIDs match the tile id rule (letters, digits and dashes, 40 at most).
    newTileId: () => crypto.randomUUID(),
  };
}

/** Accounts outside the editor (settings), over the same HTTP adapter. */
export function accountsGateway(): AccountsGateway {
  return new HttpEditorGateway((input, init) => fetch(input, init));
}
