// Rendered inside the Editor client boundary.
import { useEffect, useState } from "react";
import ReactGridLayout, { noCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { CELL_UNITS, GAP_UNITS, themeBackground } from "@flexwall/sdk";
import { tileName } from "@/application/editor/draft";
import { DEFAULT_DEVICE, DEVICE_IDS, DEVICES, LOCK_COLUMNS, LOCK_ROWS, lockscreenGeometry, WATERMARK, type DeviceId } from "@/domain/layout";
import { APP_LOCALE } from "@/domain/time";
import { catalog } from "@/plugins/registry";
import { TileBody } from "@/rendering/tile";
import { COPIED_FEEDBACK_MS } from "@/presentation/feedback";
import { useEditor, useEditorActions } from "./EditorContext";
import { useEditorTheme } from "./WallCanvas";

/** Width of the phone preview's screen, in CSS pixels. */
const SCREEN_WIDTH = 316;
/** The phone frame around the screen, on each side. */
const BEZEL = 12;

const isDeviceId = (value: string): value is DeviceId => (DEVICE_IDS as readonly string[]).includes(value);

/** The lock screen: pick tiles, arrange them under the clock, and the Shortcut that sets it every morning. */
export function LockscreenPanel({ appUrl }: { appUrl: string }) {
  const theme = useEditorTheme();
  const tiles = useEditor((s) => s.draft.tiles);
  const lockscreen = useEditor((s) => s.draft.lockscreen);
  const states = useEditor((s) => s.states);
  const today = useEditor((s) => s.today);
  const error = useEditor((s) => s.lockscreenError);
  const lockscreenPath = useEditor((s) => s.lockscreenPath);
  const watermark = useEditor((s) => s.entitlements.watermark);
  const actions = useEditorActions();

  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const deviceId = isDeviceId(lockscreen.device) ? lockscreen.device : DEFAULT_DEVICE;
  const geometry = lockscreenGeometry(SCREEN_WIDTH, DEVICES[deviceId]);
  const placed = new Set(lockscreen.placements.map((p) => p.tileId));
  const layout: Layout = lockscreen.placements.map((p) => ({ i: p.tileId, ...p.box, maxH: LOCK_ROWS }));
  const lockscreenUrl = appUrl + lockscreenPath;

  return (
    <div className="lock-panel">
      <div className="phone" style={{ width: SCREEN_WIDTH + BEZEL * 2, aspectRatio: "auto", height: geometry.height + BEZEL * 2 }}>
        <div className="phone-screen" style={{ ...themeBackground(theme), height: geometry.height }}>
          <div className={`phone-clock${theme.mode === "light" ? " dark" : ""}`}>
            <div>{now?.toLocaleDateString(APP_LOCALE, { weekday: "long", month: "long", day: "numeric" })}</div>
            <div>{now?.toLocaleTimeString(APP_LOCALE, { hour: "numeric", minute: "2-digit", hour12: false })}</div>
          </div>
          <div style={{ position: "absolute", left: geometry.margin, top: geometry.top, width: geometry.gridWidth, height: geometry.gridHeight }}>
            <ReactGridLayout
              width={geometry.gridWidth}
              layout={layout}
              gridConfig={{ cols: LOCK_COLUMNS, rowHeight: CELL_UNITS * geometry.scale, margin: [GAP_UNITS * geometry.scale, GAP_UNITS * geometry.scale], containerPadding: [0, 0], maxRows: LOCK_ROWS }}
              compactor={noCompactor}
              resizeConfig={{ enabled: true, handles: ["se"] }}
              onLayoutChange={actions.arrangeLockscreen}
              onDragStop={actions.arrangeLockscreen}
              onResizeStop={actions.arrangeLockscreen}
            >
              {lockscreen.placements.map((p) => {
                const tile = tiles.find((t) => t.id === p.tileId);
                if (!tile) return <div key={p.tileId} />;
                return (
                  <div key={p.tileId} className="grid-item">
                    <TileBody tile={tile} state={states[tile.id]} box={{ w: p.box.w, h: p.box.h }} theme={theme} surface="lockscreen" u={(n) => n * geometry.scale} today={today} catalog={catalog} />
                  </div>
                );
              })}
            </ReactGridLayout>
          </div>
          {watermark ? (
            <div className="phone-watermark" style={{ bottom: geometry.watermark.bottom, fontSize: geometry.watermark.fontSize, letterSpacing: geometry.watermark.letterSpacing, color: theme.muted }}>
              {WATERMARK.text}
            </div>
          ) : null}
        </div>
      </div>

      <div className="inspector">
        <section>
          <h3>On the lock screen</h3>
          <p className="hint">Private tiles can go here too: it&apos;s your phone.</p>
          {tiles.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={placed.has(t.id)} onChange={(e) => actions.toggleLockscreen(t.id, e.target.checked)} />
              {tileName(t, catalog)} <span className="hint">({catalog.widget(t.widget)?.name})</span>
            </label>
          ))}
          {error ? <p className="error">{error}</p> : null}
          <label className="field">
            <span>Phone</span>
            <select value={deviceId} onChange={(e) => isDeviceId(e.target.value) && actions.setDevice(e.target.value)}>
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
                setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <ol className="hint lock-steps">
            <li>Shortcuts, then Automation, then +, then Time of Day, 7:00, Daily, Run Immediately.</li>
            <li>Add “Get Contents of URL” with the link above.</li>
            <li>Add “Set Wallpaper Photo”, Lock Screen, preview off.</li>
          </ol>
          <button type="button" className="link" onClick={() => void actions.rotateLockscreenLink()}>
            Make a new link (the old one stops working)
          </button>
        </section>
      </div>
    </div>
  );
}
