"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { ConnectionView } from "@/domain/connection";
import type { Entitlements } from "@/domain/user";
import type { Tile, Wall, WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { Logo } from "@/components/brand/Logo";
import { addTile, attachConnection, dataSignature, detachConnection, duplicateTile, removeTile, restoreTile } from "./editor-model";
import { CheckIcon, ExternalIcon, SettingsIcon } from "./icons";
import { Inspector } from "./Inspector";
import { Library } from "./Library";
import { LockscreenPanel } from "./LockscreenPanel";
import { WallCanvas } from "./WallCanvas";
import "./editor.css";

export interface EditorProps {
  wall: Wall;
  entitlements: Entitlements;
  connections: ConnectionView[];
  lockscreenPath: string;
  appUrl: string;
}

type SaveState = { kind: "saved" } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string };

const toDraft = (w: Wall): WallDraft => ({ title: w.title, bio: w.bio, theme: w.theme, tiles: w.tiles, lockscreen: w.lockscreen, published: w.published, listed: w.listed });

/** Shown on an empty wall, in this order, when installed. */
const QUICK_ADD = ["stat", "sparkline", "note"];

/** How long "Undo" stays on screen after a delete. */
const UNDO_MS = 6000;

/**
 * The editor holds one draft. Every change goes through editor-model, is shown
 * at once, saved a second later, and refetches values only when a binding changed.
 */
export function Editor({ wall, entitlements, connections: initialConnections, lockscreenPath: initialLockPath, appUrl }: EditorProps) {
  const [draft, setDraft] = useState<WallDraft>(() => toDraft(wall));
  const [selected, setSelected] = useState<string | null>(null);
  const [surface, setSurface] = useState<"wall" | "lockscreen">("wall");
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [states, setStates] = useState<Record<string, TileState>>({});
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockscreenPath, setLockscreenPath] = useState(initialLockPath);
  const [connections, setConnections] = useState(initialConnections);
  const [connectFocus, setConnectFocus] = useState<{ tileId: string; n: number } | null>(null);
  const [removed, setRemoved] = useState<Tile | null>(null);
  const firstRender = useRef(true);

  const current = useRef(draft);
  const knownConnections = useRef(connections);
  knownConnections.current = connections;

  // Only a draft that actually changed is dirty: grid events often report the layout it already has.
  const change = useCallback((next: WallDraft | ((d: WallDraft) => WallDraft)) => {
    const updated = typeof next === "function" ? next(current.current) : next;
    if (updated === current.current) return;
    current.current = updated;
    setDraft(updated);
    setSave({ kind: "dirty" });
  }, []);

  // Autosave, debounced. The server re-validates everything and says what's wrong.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setSave({ kind: "saving" });
      const res = await fetch("/api/wall", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }).catch(() => null);
      const body = await res?.json().catch(() => ({}));
      setSave(res?.ok ? { kind: "saved" } : { kind: "error", message: body?.message ?? "Couldn't save. Check your connection." });
    }, 900);
    return () => clearTimeout(t);
  }, [draft]);

  // Values: refetched only when bindings change, not when tiles move.
  const signature = useMemo(() => dataSignature(draft), [draft]);
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch("/api/wall/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tiles: draft.tiles }), signal: controller.signal }).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { states: Record<string, TileState>; today: string };
      setStates(body.states);
      setToday(body.today);
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const theme = catalog.theme(draft.theme) ?? catalog.defaultTheme();
  const atLimit = draft.tiles.length >= entitlements.maxTiles;
  const selectedTile = draft.tiles.find((t) => t.id === selected) ?? null;

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setConnectFocus((f) => (f && f.tileId === id ? f : null));
  }, []);

  const add = (widgetId: string) => {
    const result = addTile(current.current, widgetId, catalog, knownConnections.current);
    if (!result) return;
    change(result.draft);
    select(result.tileId);
    setSurface("wall");
  };

  const remove = useCallback(
    (tileId: string) => {
      const tile = current.current.tiles.find((t) => t.id === tileId);
      if (!tile) return;
      change((d) => removeTile(d, tileId));
      setRemoved(tile);
      setSelected((s) => (s === tileId ? null : s));
    },
    [change]
  );

  const undo = useCallback(() => {
    if (!removed) return;
    change((d) => restoreTile(d, removed));
    setSelected(removed.id);
    setRemoved(null);
  }, [removed, change]);

  const duplicate = useCallback(
    (tileId: string) => {
      if (current.current.tiles.length >= entitlements.maxTiles) return;
      const result = duplicateTile(current.current, tileId);
      if (!result) return;
      change(result.draft);
      setSelected(result.tileId);
    },
    [change, entitlements.maxTiles]
  );

  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [removed]);

  const connected = (c: ConnectionView) => {
    const known = knownConnections.current;
    change((d) => attachConnection(d, c, known));
    setConnections([...known.filter((x) => x.id !== c.id), c]);
  };

  const disconnected = (c: ConnectionView) => {
    const remaining = knownConnections.current.filter((x) => x.id !== c.id);
    change((d) => detachConnection(d, c, remaining));
    setConnections(remaining);
  };

  // Delete removes the selected tile, ⌘D duplicates it, ⌘Z brings back the last one removed. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable);
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove(selected);
      } else if (selected && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(selected);
      } else if (removed && mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, removed, remove, duplicate, undo, select]);

  const quickAdd = QUICK_ADD.flatMap((id) => {
    const w = catalog.widget(id);
    return w ? [{ id: w.id, name: w.name }] : [];
  });

  return (
    <div className="editor">
      <header className="ed-bar">
        <div className="ed-bar-start">
          <Link href="/" className="ed-brand" aria-label="Flexwall home">
            <Logo size={26} />
          </Link>
          <span className="ed-crumb" aria-hidden="true">
            /
          </span>
          <span className="ed-handle">@{wall.handle}</span>
          <SaveStatus save={save} />
        </div>

        <div className="ed-segment ed-surface" role="radiogroup" aria-label="Surface">
          <button type="button" role="radio" aria-checked={surface === "wall"} onClick={() => setSurface("wall")}>
            Wall
          </button>
          <button type="button" role="radio" aria-checked={surface === "lockscreen"} onClick={() => setSurface("lockscreen")}>
            Lock screen
          </button>
        </div>

        <div className="ed-bar-end">
          <Link className="ed-icon-btn" href="/settings" aria-label="Account settings" title="Account settings">
            <SettingsIcon />
          </Link>
          <a className="btn btn-small" href={`/@${wall.handle}`} target="_blank" rel="noreferrer">
            {draft.published ? "View page" : "Preview"} <ExternalIcon size={14} />
          </a>
          {draft.published ? (
            <span className="ed-live" title="Your wall is public">
              <span className="ed-dot" /> Live
            </span>
          ) : (
            <button type="button" className="btn btn-signal btn-small" onClick={() => change((d) => ({ ...d, published: true }))}>
              Publish
            </button>
          )}
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-side" aria-label="Add a tile">
          <Library
            count={draft.tiles.length}
            max={entitlements.maxTiles}
            disabled={atLimit}
            limitMessage={atLimit ? (entitlements.paid ? "This wall is full." : `Free walls hold ${entitlements.maxTiles} tiles.`) : null}
            onAdd={add}
          />
        </aside>

        <main className="canvas" onMouseDown={(e) => e.target === e.currentTarget && select(null)}>
          {surface === "wall" ? (
            <WallCanvas
              draft={draft}
              states={states}
              theme={theme}
              today={today}
              selected={selected}
              onSelect={select}
              onChange={change}
              onRemove={remove}
              onDuplicate={duplicate}
              onConnect={(tileId: string) => {
                setSelected(tileId);
                setConnectFocus((f) => ({ tileId, n: (f?.n ?? 0) + 1 }));
              }}
              quickAdd={quickAdd}
              onAdd={add}
            />
          ) : (
            <LockscreenPanel draft={draft} states={states} theme={theme} today={today} lockscreenUrl={appUrl + lockscreenPath} onChange={change} onRotated={setLockscreenPath} watermark={entitlements.watermark} />
          )}

          {removed ? (
            <div className="ed-toast" role="status">
              <span>{catalog.widget(removed.widget)?.name ?? "Tile"} deleted</span>
              <button type="button" onClick={undo}>
                Undo
              </button>
            </div>
          ) : null}
        </main>

        <aside className="editor-side right" aria-label="Inspector">
          <Inspector
            draft={draft}
            tile={selectedTile}
            entitlements={entitlements}
            connections={connections}
            connectFocus={connectFocus && connectFocus.tileId === selected ? connectFocus.n : undefined}
            state={selectedTile ? states[selectedTile.id] : undefined}
            onChange={change}
            onDeselect={() => select(null)}
            onRemove={remove}
            onDuplicate={duplicate}
            onConnected={connected}
            onDisconnected={disconnected}
          />
        </aside>
      </div>
    </div>
  );
}

function SaveStatus({ save }: { save: SaveState }) {
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
