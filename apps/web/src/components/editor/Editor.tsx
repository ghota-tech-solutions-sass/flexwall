"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectNotice } from "@/components/connections/ConnectNotice";
import type { EditorInit } from "@/application/editor/state";
import { catalog } from "@/plugins/registry";
import { Logo } from "@/components/brand/Logo";
import { editorDeps } from "@/presentation/editor/composition";
import { CLOSED, isOpen, nextSheet, type Sheet } from "@/presentation/editor/sheet";
import { isTypingInto, shortcutFor } from "@/presentation/editor/shortcuts";
import { ROUTES } from "@/presentation/routes";
import { TEMPLATES } from "@/domain/templates";
import { EditorProvider, useEditor, useEditorActions } from "./EditorContext";
import { CheckIcon, CloseIcon, ExternalIcon, PlusIcon, SettingsIcon, TypeIcon } from "./icons";
import { Inspector } from "./Inspector";
import { Library } from "./Library";
import { LockscreenPanel } from "./LockscreenPanel";
import { WallCanvas, useMediaQuery } from "./WallCanvas";
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

/** Below this width the two side panels become one sheet over the wall. */
const PHONE_SHELL = "(max-width: 900px)";

function EditorShell({ appUrl }: { appUrl: string }) {
  const surface = useEditor((s) => s.surface);
  const actions = useEditorActions();
  const connections = useEditor((s) => s.connections);
  const selected = useEditor((s) => s.selected);
  const phone = useMediaQuery(PHONE_SHELL);
  const [sheet, setSheet] = useState<Sheet>(CLOSED);
  useShortcuts();

  // Selecting a tile is what opens the inspector on a phone: the panel is off-screen otherwise.
  useEffect(() => {
    setSheet((current) => nextSheet(current, selected ? "select" : "deselect"));
  }, [selected]);

  const canvas = (
    <main className="canvas" onMouseDown={(e) => e.target === e.currentTarget && actions.select(null)}>
      <SaveError />
      {surface === "wall" ? <GettingStarted /> : null}
      {surface === "wall" ? <WallCanvas /> : <LockscreenPanel appUrl={appUrl} />}
      <UndoToast />
    </main>
  );

  if (phone) {
    return (
      <div className="editor editor-mobile">
        <EditorBar />
        <ConnectNotice connections={connections} onConnected={actions.adoptConnection} />
        <div className="editor-body">{canvas}</div>
        <EditorDock
          sheet={sheet}
          onAdd={() => setSheet((s) => nextSheet(s, "add"))}
          onDesign={() => {
            actions.select(null);
            setSheet((s) => nextSheet(s, "design"));
          }}
        />
        <EditorSheet
          sheet={sheet}
          onDismiss={() => {
            if (sheet.kind === "inspector") actions.select(null);
            setSheet(CLOSED);
          }}
          onExpand={() => setSheet((s) => nextSheet(s, "expand"))}
        />
      </div>
    );
  }

  return (
    <div className="editor">
      <EditorBar />
      <ConnectNotice connections={connections} onConnected={actions.adoptConnection} />
      <div className="editor-body">
        <aside className="editor-side" aria-label="Add a tile">
          <Library />
        </aside>
        {canvas}
        <aside className="editor-side right" aria-label="Inspector">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}

/** A draft owner can reach the first useful number without discovering the inspector first. */
function GettingStarted() {
  const published = useEditor((s) => s.draft.published);
  const tiles = useEditor((s) => s.draft.tiles);
  const actions = useEditorActions();
  if (published || !tiles.length) return null;
  const firstNumber = tiles.find((tile) => catalog.widget(tile.widget)?.inputs.length);
  return <section className="ed-start-guide" aria-label="Set up your wall">
    <strong>Your first wall, in three steps</strong>
    <p>Choose a layout, add your numbers, then preview and publish. Your draft is only visible to you.</p>
    <div className="row">
      <details><summary>1. Choose a starting layout</summary>
        <p>Replaces the current tiles. Use Undo to restore them.</p>
        <div className="ed-templates">{TEMPLATES.map((template) => <button type="button" key={template.id} onClick={() => actions.applyTemplate(template.id)}><strong>{template.name}</strong><small>{template.tagline}</small></button>)}</div>
      </details>
      <button type="button" className="btn btn-small" onClick={() => firstNumber ? actions.select(firstNumber.id) : actions.addTile("stat")}>2. Add your numbers</button>
      <span>3. Preview, then Publish above</span>
    </div>
  </section>;
}

const SHEET_TITLES: Record<Sheet["kind"], string> = { none: "", library: "Add a tile", inspector: "Tile", wall: "Design" };

/** The phone's one panel: the library, the selected tile, or the wall's settings. */
function EditorSheet({ sheet, onDismiss, onExpand }: { sheet: Sheet; onDismiss: () => void; onExpand: () => void }) {
  if (!isOpen(sheet)) return null;
  const full = sheet.kind !== "inspector" || sheet.height === "full";
  return (
    <>
      <div className="ed-sheet-veil" onPointerDown={onDismiss} aria-hidden="true" />
      <section className="ed-sheet" data-height={full ? "full" : "peek"} aria-label={SHEET_TITLES[sheet.kind]}>
        <header className="ed-sheet-head">
          <button type="button" className="ed-sheet-grip" aria-label={full ? "Sheet" : "Expand"} onClick={onExpand} />
          <h2>{SHEET_TITLES[sheet.kind]}</h2>
          <button type="button" className="ed-icon-btn" aria-label="Close" onClick={onDismiss}>
            <CloseIcon size={16} />
          </button>
        </header>
        <div className="ed-sheet-body">{sheet.kind === "library" ? <Library /> : <Inspector />}</div>
      </section>
    </>
  );
}

/** Always within a thumb's reach: add a tile, the wall's design, and the surface switch. */
function EditorDock({ sheet, onAdd, onDesign }: { sheet: Sheet; onAdd: () => void; onDesign: () => void }) {
  const surface = useEditor((s) => s.surface);
  const actions = useEditorActions();
  return (
    <nav className="ed-dock" aria-label="Editor">
      <button type="button" data-active={sheet.kind === "library"} onClick={onAdd}>
        <PlusIcon size={18} /> Add
      </button>
      <button type="button" data-active={sheet.kind === "wall"} onClick={onDesign}>
        <TypeIcon size={18} /> Design
      </button>
      <button type="button" onClick={() => actions.showSurface(surface === "wall" ? "lockscreen" : "wall")}>
        <ExternalIcon size={16} /> {surface === "wall" ? "Lock screen" : "Wall"}
      </button>
    </nav>
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
  const restorePoint = useEditor((s) => s.restorePoint);
  const actions = useEditorActions();
  if (restorePoint) {
    return (
      <div className="ed-toast" role="status">
        <span>Template applied</span>
        <button type="button" onClick={actions.undoTemplate}>
          Undo
        </button>
      </div>
    );
  }
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
