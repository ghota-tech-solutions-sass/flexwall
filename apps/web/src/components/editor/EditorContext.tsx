"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { EditorDeps } from "@/application/editor/ports";
import type { EditorInit } from "@/application/editor/state";
import { createEditorStore, type EditorActions, type EditorStore, type EditorStoreState } from "@/application/editor/store";
import { disambiguate } from "@/domain/connection";
import { catalog } from "@/plugins/registry";

const EditorStoreContext = createContext<EditorStore | null>(null);

/** Builds one store for the editor's lifetime from injected dependencies, and starts it. */
export function EditorProvider({ deps, init, children }: { deps: () => EditorDeps; init: EditorInit; children: ReactNode }) {
  const [store] = useState(() => createEditorStore(deps(), init));
  useEffect(() => {
    const { actions } = store.getState();
    actions.start();
    return actions.stop;
  }, [store]);
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

/** Reads part of the editor state. Components re-render only when what they select changes. */
export function useEditor<T>(select: (state: EditorStoreState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor needs an <EditorProvider> above it");
  return useStore(store, select);
}

/** Every account's name, numbered where two of one connector would read the same. One map, so an account reads the same everywhere. */
export function useConnectionNames(): Record<string, string> {
  const connections = useEditor((s) => s.connections);
  return useMemo(() => disambiguate(connections, (id) => catalog.connector(id)?.name), [connections]);
}

/** The editor's use cases. Stable for the store's lifetime. */
export function useEditorActions(): EditorActions {
  return useEditor((state) => state.actions);
}
