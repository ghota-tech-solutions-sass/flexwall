// Rendered inside the Editor client boundary.
import { useEffect, useState } from "react";
import ReactGridLayout, { noCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GAP_UNITS, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { DEVICE_IDS, DEVICES, LOCK_COLUMNS, LOCK_ROWS, type DeviceId } from "@/domain/layout";
import type { WallDraft } from "@/domain/wall";
import { catalog } from "@/plugins/registry";
import { TileBody } from "@/rendering/tile";
import { applyLockscreenLayout, placeOnLockscreen, removeFromLockscreen } from "./editor-model";

interface Props {
  draft: WallDraft;
  states: Record<string, TileState>;
  theme: Theme;
  today: string;
  lockscreenUrl: string;
  watermark: boolean;
  onChange: (next: (d: WallDraft) => WallDraft) => void;
  onRotated: (path: string) => void;
}

const SCREEN_WIDTH = 316;

/** The lock screen: pick tiles, arrange them under the clock, and the Shortcut that sets it every morning. */
export function LockscreenPanel({ draft, states, theme, today, lockscreenUrl, watermark, onChange, onRotated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const device = DEVICES[draft.lockscreen.device as DeviceId] ?? DEVICES["iphone-17-pro"];
  const height = (SCREEN_WIDTH * device.h) / device.w;
  const margin = SCREEN_WIDTH * 0.075;
  const gridWidth = SCREEN_WIDTH - margin * 2;
  const px = gridWidth / (LOCK_COLUMNS * 100 + (LOCK_COLUMNS - 1) * GAP_UNITS);
  const gridHeight = (LOCK_ROWS * 100 + (LOCK_ROWS - 1) * GAP_UNITS) * px;
  const top = Math.max(height * 0.4, height * 0.87 - gridHeight);
  const placed = new Set(draft.lockscreen.placements.map((p) => p.tileId));

  const layout: Layout = draft.lockscreen.placements.map((p) => ({ i: p.tileId, ...p.box, maxH: LOCK_ROWS }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)", gap: 32, alignItems: "start" }}>
      <div className="phone" style={{ width: SCREEN_WIDTH + 24, aspectRatio: "auto", height: height + 24 }}>
        <div className="phone-screen" style={{ background: theme.page, height }}>
          <div className={`phone-clock${theme.mode === "light" ? " dark" : ""}`}>
            <div>{now?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            <div>{now?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}</div>
          </div>
          <div style={{ position: "absolute", left: margin, top, width: gridWidth, height: gridHeight }}>
            <ReactGridLayout
              width={gridWidth}
              layout={layout}
              gridConfig={{ cols: LOCK_COLUMNS, rowHeight: 100 * px, margin: [GAP_UNITS * px, GAP_UNITS * px], containerPadding: [0, 0], maxRows: LOCK_ROWS }}
              compactor={noCompactor}
              resizeConfig={{ enabled: true, handles: ["se"] }}
              onLayoutChange={(next) => onChange((d) => applyLockscreenLayout(d, next))}
              onDragStop={(next) => onChange((d) => applyLockscreenLayout(d, next))}
              onResizeStop={(next) => onChange((d) => applyLockscreenLayout(d, next))}
            >
              {draft.lockscreen.placements.map((p) => {
                const tile = draft.tiles.find((t) => t.id === p.tileId);
                if (!tile) return <div key={p.tileId} />;
                return (
                  <div key={p.tileId} className="grid-item">
                    <TileBody tile={tile} state={states[tile.id]} box={{ w: p.box.w, h: p.box.h }} theme={theme} surface="lockscreen" u={(n) => n * px} today={today} catalog={catalog} />
                  </div>
                );
              })}
            </ReactGridLayout>
          </div>
          {watermark ? (
            <div style={{ position: "absolute", bottom: height * 0.035, width: "100%", textAlign: "center", fontSize: 9, letterSpacing: 1.2, color: theme.muted }}>FLEXWALL.LOL</div>
          ) : null}
        </div>
      </div>

      <div className="inspector">
        <section>
          <h3>On the lock screen</h3>
          <p className="hint">Private tiles can go here too: it&apos;s your phone.</p>
          {draft.tiles.map((t) => {
            const widget = catalog.widget(t.widget);
            const label = String(t.options.label || t.options.title || widget?.name || t.id);
            return (
              <label key={t.id} className="check">
                <input
                  type="checkbox"
                  checked={placed.has(t.id)}
                  onChange={(e) => {
                    setError(null);
                    if (!e.target.checked) return onChange((d) => removeFromLockscreen(d, t.id));
                    const result = placeOnLockscreen(draft, t.id, catalog);
                    if ("error" in result) setError(result.error);
                    else onChange(() => result.draft);
                  }}
                />
                {label} <span className="hint">({widget?.name})</span>
              </label>
            );
          })}
          {error ? <p className="error">{error}</p> : null}
          <label className="field">
            <span>Phone</span>
            <select value={draft.lockscreen.device} onChange={(e) => onChange((d) => ({ ...d, lockscreen: { ...d.lockscreen, device: e.target.value as DeviceId } }))}>
              {DEVICE_IDS.map((id) => (
                <option key={id} value={id}>
                  {DEVICES[id].label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section>
          <h3>Set it up on your iPhone</h3>
          <div className="row">
            <input readOnly value={lockscreenUrl} className="mono" onFocus={(e) => e.currentTarget.select()} aria-label="Lock screen image link" />
            <button
              type="button"
              className="btn btn-small"
              onClick={async () => {
                await navigator.clipboard.writeText(lockscreenUrl).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <ol className="hint" style={{ paddingLeft: "1.2em", margin: 0 }}>
            <li>Shortcuts → Automation → + → Time of Day, 7:00, Daily, Run Immediately.</li>
            <li>Add “Get Contents of URL” with the link above.</li>
            <li>Add “Set Wallpaper Photo”, Lock Screen, preview off.</li>
          </ol>
          <button
            type="button"
            className="link"
            onClick={async () => {
              const res = await fetch("/api/wall/lockscreen-link", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
              if (res.ok) onRotated((await res.json()).lockscreenPath);
            }}
          >
            Make a new link (the old one stops working)
          </button>
        </section>
      </div>
    </div>
  );
}
