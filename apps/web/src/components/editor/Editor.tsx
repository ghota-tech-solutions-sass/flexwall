"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectNotice } from "@/components/connections/ConnectNotice";
import type { EditorInit } from "@/application/editor/state";
import { catalog } from "@/plugins/registry";
import { Logo } from "@/components/brand/Logo";
import { editorDeps } from "@/presentation/editor/composition";
import { isTypingInto, shortcutFor } from "@/presentation/editor/shortcuts";
import { ROUTES } from "@/presentation/routes";
import { EditorProvider, useEditor, useEditorActions } from "./EditorContext";
import { CheckIcon, ExternalIcon, SettingsIcon } from "./icons";
import { Inspector } from "./Inspector";
import { Library } from "./Library";
import { LockscreenPanel } from "./LockscreenPanel";
import { WallCanvas } from "./WallCanvas";
import "./editor.css";

export interface EditorProps {
  init: EditorInit;
  appUrl: string;
}

/**
 * The editor: a store built from the browser's composition root, and views
 * that read it. Every rule lives in the store's use cases; nothing here decides.
 */
export function Editor({ init, appUrl }: EditorProps) {
  return (
    <EditorProvider deps={editorDeps} init={init}>
      <EditorShell appUrl={appUrl} />
    </EditorProvider>
  );
}

function EditorShell({ appUrl }: { appUrl: string }) {
  const surface = useEditor((s) => s.surface);
  const actions = useEditorActions();
  const connections = useEditor((s) => s.connections);
  useShortcuts();

  return (
    <div className="editor">
      <EditorBar />
      <ConnectNotice connections={connections} onConnected={actions.adoptConnection} />
      <div className="editor-body">
        <aside className="editor-side" aria-label="Add a tile">
          <Library />
        </aside>
        <main className="canvas" onMouseDown={(e) => e.target === e.currentTarget && actions.select(null)}>
          <SaveError />
          {surface === "wall" ? <WallCanvas /> : <LockscreenPanel appUrl={appUrl} />}
          <UndoToast />
        </main>
        <aside className="editor-side right" aria-label="Inspector">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}

/** Shortcuts act on the store; they never fire while the owner is typing. */
function useShortcuts() {
  const actions = useEditorActions();
  const selected = useEditor((s) => s.selected);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingInto(event.target)) return;
      const action = shortcutFor(event);
      if (!action) return;
      if (action === "deselect") return actions.select(null);
      if (action === "save") return (event.preventDefault(), void actions.saveNow());
      // Everything below acts on a tile.
      if (action === "undo") return (event.preventDefault(), actions.undoRemove());
      if (!selected) return;
      event.preventDefault();
      if (action === "delete") actions.removeTile(selected);
      else actions.duplicateTile(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, selected]);
}

function EditorBar() {
  const handle = useEditor((s) => s.handle);
  const published = useEditor((s) => s.draft.published);
  const surface = useEditor((s) => s.surface);
  const actions = useEditorActions();

  return (
    <header className="ed-bar">
      <div className="ed-bar-start">
        <Link href={ROUTES.home} className="ed-brand" aria-label="Flexwall home">
          <Logo size={26} />
        </Link>
        <span className="ed-crumb" aria-hidden="true">
          /
        </span>
        <span className="ed-handle">@{handle}</span>
        <SaveStatus />
      </div>

      <div className="ed-segment ed-surface" role="radiogroup" aria-label="Surface">
        <button type="button" role="radio" aria-checked={surface === "wall"} onClick={() => actions.showSurface("wall")}>
          Wall
        </button>
        <button type="button" role="radio" aria-checked={surface === "lockscreen"} onClick={() => actions.showSurface("lockscreen")}>
          Lock screen
        </button>
      </div>

      <div className="ed-bar-end">
        <Link className="ed-icon-btn" href={ROUTES.settings} aria-label="Account settings" title="Account settings">
          <SettingsIcon />
        </Link>
        <a className="btn btn-small" href={ROUTES.wall(handle)} target="_blank" rel="noreferrer">
          {published ? "View page" : "Preview"} <ExternalIcon size={14} />
        </a>
        {published ? (
          <span className="ed-live" title="Your wall is public">
            <span className="ed-dot" /> Live
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-signal btn-small"
            onClick={async () => {
              actions.setPublished(true);
              // Publishing a draft that never reached the server would show yesterday's wall.
              await actions.saveNow();
            }}
          >
            Publish
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * A refused save, said out loud and recoverable. The pill in the bar is easy to
 * miss on a phone, and the wall keeps taking edits that nobody is storing.
 */
function SaveError() {
  const save = useEditor((s) => s.save);
  const actions = useEditorActions();
  const [retrying, setRetrying] = useState(false);
  if (save.kind !== "error") return null;
  return (
    <div className="ed-save-error" role="alert">
      <span>{save.message}</span>
      <button
        type="button"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await actions.saveNow();
          setRetrying(false);
        }}
      >
        {retrying ? "Saving…" : "Try again"}
      </button>
    </div>
  );
}

function SaveStatus() {
  const save = useEditor((s) => s.save);
  return (
    <span className="ed-save" data-kind={save.kind} role="status" title={save.kind === "error" ? save.message : undefined}>
      {save.kind === "saved" ? (
        <>
          <CheckIcon size={14} /> Saved
        </>
      ) : save.kind === "saving" ? (
        "Saving…"
      ) : save.kind === "dirty" ? (
        "Editing"
      ) : (
        save.message
      )}
    </span>
  );
}

function UndoToast() {
  const removed = useEditor((s) => s.removed);
  const actions = useEditorActions();
  if (!removed) return null;
  return (
    <div className="ed-toast" role="status">
      <span>{catalog.widget(removed.widget)?.name ?? "Tile"} deleted</span>
      <button type="button" onClick={actions.undoRemove}>
        Undo
      </button>
    </div>
  );
}
