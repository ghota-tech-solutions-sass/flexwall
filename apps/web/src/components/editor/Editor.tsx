"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { ConnectionView } from "@/domain/connection";
import type { Entitlements } from "@/domain/user";
import type { Wall, WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { addTile, dataSignature, removeTile } from "./editor-model";
import { Inspector } from "./Inspector";
import { Library } from "./Library";
import { LockscreenPanel } from "./LockscreenPanel";
import { WallCanvas } from "./WallCanvas";

export interface EditorProps {
  wall: Wall;
  entitlements: Entitlements;
  connections: ConnectionView[];
  lockscreenPath: string;
  appUrl: string;
}

type SaveState = { kind: "saved" } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string };

const toDraft = (w: Wall): WallDraft => ({ title: w.title, bio: w.bio, theme: w.theme, tiles: w.tiles, lockscreen: w.lockscreen, published: w.published, listed: w.listed });

/**
 * The editor holds one draft. Every change goes through editor-model, is shown
 * at once, saved a second later, and refetches values only when a binding changed.
 */
export function Editor({ wall, entitlements, connections, lockscreenPath: initialLockPath, appUrl }: EditorProps) {
  const [draft, setDraft] = useState<WallDraft>(() => toDraft(wall));
  const [selected, setSelected] = useState<string | null>(null);
  const [surface, setSurface] = useState<"wall" | "lockscreen">("wall");
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [states, setStates] = useState<Record<string, TileState>>({});
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockscreenPath, setLockscreenPath] = useState(initialLockPath);
  const firstRender = useRef(true);

  const current = useRef(draft);

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
      const res = await fetch("/api/wall", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const body = await res.json().catch(() => ({}));
      setSave(res.ok ? { kind: "saved" } : { kind: "error", message: body.message ?? "Couldn't save." });
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

  // Delete removes the selected tile, unless the owner is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (!typing && selected && (e.key === "Delete" || e.key === "Backspace")) {
        change((d) => removeTile(d, selected));
        setSelected(null);
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, change]);

  return (
    <div className="editor">
      <div className="editor-bar">
        <Link href="/" className="brand">
          flexwall<span>.lol</span>
        </Link>
        <div className="segmented" role="group" aria-label="Surface">
          <button type="button" aria-pressed={surface === "wall"} onClick={() => setSurface("wall")}>
            Wall
          </button>
          <button type="button" aria-pressed={surface === "lockscreen"} onClick={() => setSurface("lockscreen")}>
            Lock screen
          </button>
        </div>
        <span className="spacer" />
        <span className={`status${save.kind === "error" ? " error" : ""}`} role="status">
          {save.kind === "saved" ? "Saved" : save.kind === "saving" ? "Saving…" : save.kind === "dirty" ? "Unsaved changes" : save.message}
        </span>
        <label className="check">
          <input type="checkbox" checked={draft.published} onChange={(e) => change((d) => ({ ...d, published: e.target.checked, listed: e.target.checked && d.listed }))} />
          Published
        </label>
        <a className="btn btn-small" href={`/@${wall.handle}`} target="_blank" rel="noreferrer">
          View page
        </a>
        <Link className="btn btn-small" href="/settings">
          Settings
        </Link>
      </div>

      <div className="editor-body">
        <aside className="editor-side" aria-label="Add a tile">
          <Library
            disabled={atLimit}
            limitMessage={atLimit ? (entitlements.paid ? "This wall is full." : `Free walls hold ${entitlements.maxTiles} tiles.`) : null}
            onAdd={(widgetId) => {
              const result = addTile(draft, widgetId, catalog, connections);
              if (!result) return;
              change(result.draft);
              setSelected(result.tileId);
              setSurface("wall");
            }}
          />
        </aside>

        <main className="canvas" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          {surface === "wall" ? (
            <WallCanvas draft={draft} states={states} theme={theme} today={today} selected={selected} onSelect={setSelected} onChange={change} />
          ) : (
            <LockscreenPanel draft={draft} states={states} theme={theme} today={today} lockscreenUrl={appUrl + lockscreenPath} onChange={change} onRotated={setLockscreenPath} watermark={entitlements.watermark} />
          )}
        </main>

        <aside className="editor-side right" aria-label="Inspector">
          <Inspector
            draft={draft}
            tile={selectedTile}
            entitlements={entitlements}
            connections={connections}
            state={selectedTile ? states[selectedTile.id] : undefined}
            onChange={change}
            onDeselect={() => setSelected(null)}
          />
        </aside>
      </div>
    </div>
  );
}
