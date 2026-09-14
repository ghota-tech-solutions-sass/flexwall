import { createStore, type StoreApi } from "zustand/vanilla";
import type { FieldValue, FieldValues } from "@flexwall/sdk";
import type { ConnectionView } from "@/domain/connection";
import type { DeviceId } from "@/domain/layout";
import type { SourceRef } from "@/domain/source";
import { canUseTheme, type Binding, type Visibility, type WallDraft } from "@/domain/wall";
import {
  addTile,
  applyLayout,
  applyLockscreenLayout,
  attachConnection,
  bindingFor,
  dataSignature,
  detachConnection,
  duplicateTile,
  placeOnLockscreen,
  removeFromLockscreen,
  removeTile,
  restoreTile,
  setBinding,
  setConnection,
  updateTile,
} from "./draft";
import type { EditorDeps, Outcome } from "./ports";
import { EDITOR_TIMINGS, initialState, type EditorInit, type EditorState, type EditorSurface } from "./state";

type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

/** An input of a tile: where a picked source or account goes. */
export interface InputTarget {
  tileId: string;
  inputKey: string;
}

/**
 * The editor's use cases. Each one changes the draft through the pure
 * functions in `draft.ts`; saving and refreshing values follow on their own.
 */
export interface EditorActions {
  /** Loads values for the first time. */
  start(): void;
  /** Cancels pending saves and timers, for when the editor goes away. */
  stop(): void;

  select(tileId: string | null): void;
  showSurface(surface: EditorSurface): void;

  addTile(widgetId: string): void;
  removeTile(tileId: string): void;
  undoRemove(): void;
  duplicateTile(tileId: string): void;
  moveTiles(layout: readonly LayoutItem[]): void;

  setVisibility(tileId: string, visibility: Visibility): void;
  setOption(tileId: string, key: string, value: FieldValue | undefined): void;
  pickSource(target: InputTarget, source: SourceRef | null): void;
  setBinding(target: InputTarget, binding: Binding): void;
  chooseAccount(target: InputTarget, connectionId: string): void;

  setTitle(title: string): void;
  setBio(bio: string): void;
  /** Puts a theme on the wall, or only on the canvas when the owner's plan doesn't include it. */
  setTheme(themeId: string): void;
  endThemePreview(): void;
  setPublished(published: boolean): void;
  setListed(listed: boolean): void;

  requestConnect(tileId: string): void;
  /** Connects an account; waiting tiles use it, and so does `target` when given. */
  connectAccount(connector: string, values: FieldValues, target?: InputTarget): Promise<Outcome<ConnectionView>>;
  removeAccount(connection: ConnectionView): Promise<Outcome<void>>;

  toggleLockscreen(tileId: string, on: boolean): void;
  arrangeLockscreen(layout: readonly LayoutItem[]): void;
  setDevice(device: DeviceId): void;
  rotateLockscreenLink(): Promise<Outcome<string>>;
}

export type EditorStoreState = EditorState & { actions: EditorActions };
export type EditorStore = StoreApi<EditorStoreState>;

export function canAddTile(state: Pick<EditorState, "draft" | "entitlements">): boolean {
  return state.draft.tiles.length < state.entitlements.maxTiles;
}

export function createEditorStore(deps: EditorDeps, init: EditorInit): EditorStore {
  const { gateway, scheduler, catalog, newTileId } = deps;
  const cancel = { save: noop, resolve: noop, undo: noop };
  let resolveRun = 0;
  let resolvedSignature = dataSignature(init.draft);

  return createStore<EditorStoreState>()((set, get) => {
    const save = async () => {
      const draft = get().draft;
      set({ save: { kind: "saving" } });
      const outcome = await gateway.saveWall(draft);
      // A change landed while saving: it is dirty again and has its own save scheduled.
      if (get().draft !== draft) return;
      set({ save: outcome.ok ? { kind: "saved" } : { kind: "error", message: outcome.message } });
    };

    const resolve = async () => {
      const run = ++resolveRun;
      const outcome = await gateway.resolveTiles(get().draft.tiles);
      // Only the latest request may paint: an older answer describes bindings that changed since.
      if (run === resolveRun && outcome.ok) set({ states: outcome.value.states, today: outcome.value.today });
    };

    /** The one way the draft changes: marks it dirty, saves it later, refetches values if bindings moved. */
    const change = (next: (draft: WallDraft) => WallDraft) => {
      const current = get().draft;
      const updated = next(current);
      if (updated === current) return;
      set({ draft: updated, save: { kind: "dirty" } });
      cancel.save();
      cancel.save = scheduler.schedule(EDITOR_TIMINGS.autosaveMs, () => void save());
      const signature = dataSignature(updated);
      if (signature === resolvedSignature) return;
      resolvedSignature = signature;
      cancel.resolve();
      cancel.resolve = scheduler.schedule(EDITOR_TIMINGS.resolveMs, () => void resolve());
    };

    const actions: EditorActions = {
      start: () => void resolve(),
      stop: () => {
        cancel.save();
        cancel.resolve();
        cancel.undo();
      },

      select: (tileId) => set((s) => ({ selected: tileId, connectRequest: s.connectRequest?.tileId === tileId ? s.connectRequest : null })),
      showSurface: (surface) => set({ surface }),

      addTile: (widgetId) => {
        if (!canAddTile(get())) return;
        const result = addTile(get().draft, widgetId, catalog, get().connections, newTileId);
        if (!result) return;
        change(() => result.draft);
        set({ selected: result.tileId, surface: "wall", connectRequest: null });
      },
      removeTile: (tileId) => {
        const tile = get().draft.tiles.find((t) => t.id === tileId);
        if (!tile) return;
        change((d) => removeTile(d, tileId));
        set((s) => ({ removed: tile, selected: s.selected === tileId ? null : s.selected }));
        cancel.undo();
        cancel.undo = scheduler.schedule(EDITOR_TIMINGS.undoMs, () => set((s) => (s.removed === tile ? { removed: null } : s)));
      },
      undoRemove: () => {
        const tile = get().removed;
        if (!tile) return;
        cancel.undo();
        change((d) => restoreTile(d, tile));
        set({ removed: null, selected: tile.id });
      },
      duplicateTile: (tileId) => {
        if (!canAddTile(get())) return;
        const result = duplicateTile(get().draft, tileId, newTileId);
        if (!result) return;
        change(() => result.draft);
        set({ selected: result.tileId });
      },
      moveTiles: (layout) => change((d) => applyLayout(d, layout)),

      setVisibility: (tileId, visibility) => change((d) => updateTile(d, tileId, (t) => (t.visibility === visibility ? t : { ...t, visibility }))),
      setOption: (tileId, key, value) =>
        change((d) =>
          updateTile(d, tileId, (t) => {
            const options = { ...t.options };
            if (value === undefined) delete options[key];
            else options[key] = value;
            return { ...t, options };
          })
        ),
      pickSource: ({ tileId, inputKey }, source) =>
        change((d) => {
          const previous = d.tiles.find((t) => t.id === tileId)?.inputs[inputKey];
          const binding = source ? bindingFor(source, catalog, get().connections, previous) : undefined;
          return setBinding(d, tileId, inputKey, binding, catalog);
        }),
      setBinding: ({ tileId, inputKey }, binding) => change((d) => setBinding(d, tileId, inputKey, binding, catalog)),
      chooseAccount: ({ tileId, inputKey }, connectionId) => change((d) => setConnection(d, tileId, inputKey, connectionId)),

      setTitle: (title) => change((d) => ({ ...d, title })),
      setBio: (bio) => change((d) => ({ ...d, bio })),
      setTheme: (themeId) => {
        const theme = catalog.theme(themeId);
        if (!theme) return;
        if (!canUseTheme(theme, get().entitlements)) return set({ themePreview: theme.id });
        set({ themePreview: null });
        change((d) => (d.theme === theme.id ? d : { ...d, theme: theme.id }));
      },
      endThemePreview: () => set({ themePreview: null }),
      // Unpublishing also takes the wall off The Wall: a listing needs a public page.
      setPublished: (published) => change((d) => (d.published === published ? d : { ...d, published, listed: published && d.listed })),
      setListed: (listed) => change((d) => (d.listed === listed || (listed && !d.published) ? d : { ...d, listed })),

      requestConnect: (tileId) => set((s) => ({ selected: tileId, connectRequest: { tileId, count: (s.connectRequest?.count ?? 0) + 1 } })),
      connectAccount: async (connector, values, target) => {
        const outcome = await gateway.connectAccount(connector, values);
        if (!outcome.ok) return outcome;
        const connection = outcome.value;
        const known = get().connections;
        change((d) => attachConnection(d, connection, known));
        if (target) change((d) => setConnection(d, target.tileId, target.inputKey, connection.id));
        set({ connections: [...known.filter((c) => c.id !== connection.id), connection] });
        return outcome;
      },
      removeAccount: async (connection) => {
        const outcome = await gateway.removeAccount(connection.id);
        if (!outcome.ok) return outcome;
        const remaining = get().connections.filter((c) => c.id !== connection.id);
        change((d) => detachConnection(d, connection, remaining));
        set({ connections: remaining });
        return outcome;
      },

      toggleLockscreen: (tileId, on) => {
        set({ lockscreenError: null });
        if (!on) return change((d) => removeFromLockscreen(d, tileId));
        const result = placeOnLockscreen(get().draft, tileId, catalog);
        if ("error" in result) set({ lockscreenError: result.error });
        else change(() => result.draft);
      },
      arrangeLockscreen: (layout) => change((d) => applyLockscreenLayout(d, layout)),
      setDevice: (device) => change((d) => (d.lockscreen.device === device ? d : { ...d, lockscreen: { ...d.lockscreen, device } })),
      rotateLockscreenLink: async () => {
        const outcome = await gateway.rotateLockscreenLink();
        if (outcome.ok) set({ lockscreenPath: outcome.value });
        return outcome;
      },
    };

    return { ...initialState(init), actions };
  });
}

function noop() {}

