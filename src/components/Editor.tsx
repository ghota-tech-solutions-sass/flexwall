"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CONFIG,
  DEVICE_IDS,
  DEVICES,
  encodeConfig,
  proFeaturesUsed,
  THEME_IDS,
  THEMES,
  WallConfigSchema,
  type Metric,
  type WallConfig,
} from "@/lib/config";
import { PRO_PRICE_LABEL, type WallView } from "@/lib/site";
import { Phone } from "@/components/Phone";
import { ShortcutSteps } from "@/components/ShortcutSteps";
import { ConnectionsPanel } from "@/components/editor/ConnectionsPanel";
import { CopyField } from "@/components/editor/CopyField";
import { MetricFields } from "@/components/editor/MetricFields";

const keyStore = {
  get(id: string): string | null {
    try {
      return localStorage.getItem(`fw:key:${id}`);
    } catch {
      return null;
    }
  },
  set(id: string, key: string) {
    try {
      localStorage.setItem(`fw:key:${id}`, key);
    } catch {
      /* private mode: the URL still carries the key */
    }
  },
};

function editKeyFromPath(editPath: string): string {
  return new URL(editPath, "https://x").searchParams.get("k") ?? "";
}

function firstIssue(config: WallConfig): string | null {
  const r = WallConfigSchema.safeParse(config);
  if (r.success) return null;
  const issue = r.error.issues[0];
  const where = issue.path
    .map((p) => (p === "hero" ? "Big number" : p === "stats" ? "Small number" : typeof p === "number" ? `#${p + 1}` : String(p)))
    .join(" ");
  return `${where}: ${issue.message}`;
}

export function Editor({ id }: { id?: string }) {
  const [config, setConfig] = useState<WallConfig>(DEFAULT_CONFIG);
  const [wall, setWall] = useState<WallView | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "checkout" | "rotate">("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [origin, setOrigin] = useState("");
  // Read once: the address bar is rewritten to the clean edit link after load.
  const [justSaved] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("saved"));

  const api = useCallback(
    async (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        headers: { "content-type": "application/json", ...(key ? { "x-edit-key": key } : {}), ...init.headers },
      }),
    [key]
  );

  // Load: the key comes from the link (?k=) or from this browser's memory.
  useEffect(() => {
    setOrigin(window.location.origin);
    if (!id) {
      setConfig((c) => ({ ...c, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const k = params.get("k") || keyStore.get(id);
    if (!k) {
      setMissing(true);
      setLoaded(true);
      return;
    }
    keyStore.set(id, k);
    setKey(k);
    (async () => {
      const paid = params.get("paid");
      if (paid) {
        setStatus({ text: "Confirming your payment…" });
        const res = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: paid }),
        });
        const body = await res.json().catch(() => ({}));
        setStatus(
          res.ok && (body.result === "unlocked" || body.result === "already")
            ? { text: "Pro is on. Your phone picks it up at the next refresh." }
            : { text: "Payment received, Pro should show up within a minute. Reload if it doesn't.", error: !res.ok }
        );
      }
      const res = await fetch(`/api/walls/${id}`, { headers: { "x-edit-key": k } });
      if (!res.ok) {
        setMissing(true);
      } else {
        const view = (await res.json()) as WallView;
        setWall(view);
        setConfig(view.config);
        // Keep the private link in the address bar so bookmarking it works.
        window.history.replaceState(null, "", view.editPath);
      }
      setLoaded(true);
    })();
  }, [id]);

  const update = (patch: Partial<WallConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const setHero = (m: Metric) => update({ hero: m });
  const setStat = (i: number, m: Metric) => update({ stats: config.stats.map((s, j) => (j === i ? m : s)) });

  const issue = useMemo(() => firstIssue(config), [config]);

  // Debounced preview of the last valid config. A saved wall previews through
  // the owner route (edit key in a header, connections live); an unsaved one
  // through the anonymous preview.
  const [previewSrc, setPreviewSrc] = useState("");
  const connectionsVersion = wall?.connections.map((c) => c.id).join(",") ?? "";
  useEffect(() => {
    if (issue) return;
    let cancelled = false;
    let objectUrl = "";
    const t = setTimeout(async () => {
      const res = wall
        ? await api(`/api/walls/${wall.id}/preview`, { method: "POST", body: JSON.stringify({ config, width: 603 }) })
        : await fetch(`/api/preview?w=603&c=${encodeConfig(config)}`);
      if (!res.ok || cancelled) return;
      objectUrl = URL.createObjectURL(await res.blob());
      if (!cancelled) setPreviewSrc(objectUrl);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      // Revoke the previous frame once the next one replaces it.
      setTimeout(() => objectUrl && URL.revokeObjectURL(objectUrl), 5000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, issue, wall?.id, wall?.pro, connectionsVersion, api]);

  async function save() {
    if (issue) return;
    setBusy("save");
    setStatus(null);
    try {
      if (!wall) {
        const res = await fetch("/api/walls", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.status);
        const view = (await res.json()) as WallView;
        keyStore.set(view.id, editKeyFromPath(view.editPath));
        window.location.assign(view.editPath + "&saved=1");
        return;
      }
      const res = await api(`/api/walls/${wall.id}`, { method: "PATCH", body: JSON.stringify({ config }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.status);
      setWall(await res.json());
      setDirty(false);
      setStatus({ text: "Saved. Your phone shows it at the next refresh." });
    } catch (error) {
      setStatus({ text: `Couldn't save (${String((error as Error).message)}). Try again in a moment.`, error: true });
    } finally {
      setBusy("");
    }
  }

  async function checkout() {
    if (!wall) return;
    setBusy("checkout");
    setStatus(null);
    if (dirty) await save();
    const res = await api("/api/checkout", { method: "POST", body: JSON.stringify({ id: wall.id }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) {
      window.location.assign(body.url);
      return;
    }
    setBusy("");
    setStatus({
      text: body.error === "payments_not_configured" ? "Payments aren't switched on yet. Come back soon." : "Checkout didn't open. Try again.",
      error: true,
    });
  }

  async function setPublic(value: boolean) {
    if (!wall) return;
    const res = await api(`/api/walls/${wall.id}`, { method: "PATCH", body: JSON.stringify({ public: value }) });
    if (res.ok) setWall(await res.json());
  }

  async function rotate() {
    if (!wall) return;
    setBusy("rotate");
    const res = await api(`/api/walls/${wall.id}/rotate`, { method: "POST" });
    if (res.ok) {
      setWall(await res.json());
      setStatus({ text: "New image link made. Paste it into your Shortcut: the old one no longer works." });
    }
    setBusy("");
  }

  if (!loaded) return <p className="empty">Loading your wallpaper…</p>;
  if (missing) {
    return (
      <div className="empty">
        <h1>This link doesn&apos;t open a wallpaper</h1>
        <p>
          The edit link is missing its key or the wallpaper was never saved. Use the full link from the page where you
          saved it, or from your Pro receipt email.
        </p>
        <Link href="/new" className="btn btn-signal">
          Make a new one
        </Link>
      </div>
    );
  }

  const proLocked = proFeaturesUsed(config).length > 0 && !wall?.pro;
  const imageUrl = wall ? origin + wall.imagePath : "";
  const editUrl = wall ? origin + wall.editPath : "";

  return (
    <div className="editor">
      <div>
        <h1>{wall ? "Your wallpaper" : "Make your wallpaper"}</h1>
        <p className="editor-intro">
          {wall
            ? "Change anything and save. Your phone shows the new version at its next refresh."
            : "Pick your numbers and a theme, then save to get the link your iPhone will use."}
        </p>

        {wall && justSaved ? (
          <div className="panel highlight">
            <h2>Saved. Bookmark this page.</h2>
            <p>There&apos;s no account: this page&apos;s address is the only way back to your wallpaper.</p>
            <CopyField label="Private edit link" value={editUrl} />
          </div>
        ) : null}

        <section className="panel" aria-labelledby="p-big">
          <h2 id="p-big">Big number</h2>
          <p>The first thing you see when you pick up your phone.</p>
          <MetricFields metric={config.hero} onChange={setHero} config={config} wall={wall} />
        </section>

        <section className="panel" aria-labelledby="p-small">
          <h2 id="p-small">Small numbers</h2>
          <p>Up to three, in a row under the big one.</p>
          {config.stats.map((m, i) => (
            <div className="metric" key={i}>
              <MetricFields metric={m} onChange={(next) => setStat(i, next)} config={config} wall={wall} />
              <div>
                <button type="button" className="link-btn" onClick={() => update({ stats: config.stats.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {config.stats.length < 3 ? (
            <button type="button" className="btn btn-small" onClick={() => update({ stats: [...config.stats, { kind: "year-progress" }] })}>
              Add a small number
            </button>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="p-look">
          <h2 id="p-look">Look</h2>
          <p>Pro themes preview for free. Your phone shows Ink until you unlock them.</p>
          <div className="swatches" role="group" aria-label="Theme">
            {THEME_IDS.map((t) => (
              <button key={t} type="button" className="swatch" aria-pressed={config.theme === t} onClick={() => update({ theme: t })}>
                <i style={{ background: THEMES[t].swatch }} />
                {THEMES[t].label}
                {THEMES[t].pro && !wall?.pro ? <span className="tag">Pro</span> : null}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Line above the big number</span>
              <input value={config.caption} maxLength={40} placeholder="building in public" onChange={(e) => update({ caption: e.target.value })} />
            </label>
            <label className="field">
              <span>GitHub heatmap (username, optional)</span>
              <input
                value={config.heatmap}
                placeholder="your-github"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => update({ heatmap: e.target.value.trim().replace(/^@/, "") })}
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="field">
              <span>Phone</span>
              <select value={config.device} onChange={(e) => update({ device: e.target.value as WallConfig["device"] })}>
                {DEVICE_IDS.map((d) => (
                  <option key={d} value={d}>
                    {DEVICES[d].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="status" style={{ marginTop: 12 }}>
            Dates follow your time zone: {config.tz}.
          </p>
        </section>

        <div className="row" style={{ alignItems: "center" }}>
          <button type="button" className="btn btn-signal" disabled={Boolean(issue) || busy !== "" || (Boolean(wall) && !dirty)} onClick={save}>
            {busy === "save" ? "Saving…" : wall ? (dirty ? "Save changes" : "Saved") : "Save and get my link"}
          </button>
        </div>
        {issue ? <p className="status error">{issue}</p> : null}
        {status ? <p className={`status${status.error ? " error" : ""}`}>{status.text}</p> : null}

        {wall ? (
          <>
            <ConnectionsPanel wall={wall} api={api} onWall={setWall} />

            <section className="panel highlight" aria-labelledby="p-phone" style={{ marginTop: 28 }}>
              <h2 id="p-phone">Put it on your iPhone</h2>
              <p>One automation, once. After that it runs every morning on its own.</p>
              <CopyField label="Your image link (for the Shortcut)" value={imageUrl} />
              <ShortcutSteps imageUrl={imageUrl} />
              <p className="status">
                {wall.lastRenderAt
                  ? `Last picked up by a phone: ${new Date(wall.lastRenderAt).toLocaleString()}.`
                  : "No phone has picked it up yet."}{" "}
                <button type="button" className="link-btn" onClick={rotate} disabled={busy !== ""}>
                  Make a new image link
                </button>
              </p>
            </section>

            <section className="panel" aria-labelledby="p-pro">
              {wall.pro ? (
                <>
                  <h2 id="p-pro">Pro is on</h2>
                  <p>Every theme, no watermark.</p>
                  <label className="check">
                    <input type="checkbox" checked={wall.public} onChange={(e) => setPublic(e.target.checked)} />
                    Show this wallpaper in the public gallery
                  </label>
                </>
              ) : (
                <>
                  <h2 id="p-pro">Unlock Pro for {PRO_PRICE_LABEL}</h2>
                  <p>
                    Live Stripe and API connectors, the Old Money, Terminal, Sunset and Editorial themes, no
                    watermark, and a spot in the gallery. One payment, this wallpaper, forever.
                  </p>
                  <button type="button" className="btn btn-signal" onClick={checkout} disabled={busy !== "" || Boolean(issue)}>
                    {busy === "checkout" ? "Opening checkout…" : `Unlock Pro, ${PRO_PRICE_LABEL}`}
                  </button>
                </>
              )}
            </section>
            {!justSaved ? (
              <section className="panel" aria-labelledby="p-link">
                <h2 id="p-link">Your private edit link</h2>
                <p>Anyone with it can change this wallpaper. Keep it somewhere safe.</p>
                <CopyField label="Private edit link" value={editUrl} />
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <aside className="editor-preview" aria-label="Preview">
        {previewSrc ? <Phone src={previewSrc} alt="Preview of your wallpaper" tone={THEMES[config.theme].tone} /> : null}
        <p className="note">
          {proLocked
            ? "Preview with Pro features. Unlock Pro to get them on your phone."
            : wall?.pro
              ? "This is what your phone will show."
              : "Free wallpapers carry a small flexwall.lol at the bottom."}
        </p>
      </aside>
    </div>
  );
}
