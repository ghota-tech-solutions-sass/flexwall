"use client";

import { useEffect, useRef, useState } from "react";
import { xIntentUrl } from "@/lib/share";
import { BRAND, BRAND_MONO } from "@/lib/brand";

interface Props {
  rank: number;
  name: string;
  amountUSD: number;
  founder: boolean;
}

// Même format que l'image Open Graph : le PNG téléchargé doit être celui que
// X et iMessage affichent, pas une variante en 16:9.
const W = 1200;
const H = 630;

/** Carte de partage 1200×675 dessinée en canvas — chaque rang devient un post. */
export default function ShareCard({ rank, name, amountUSD, founder }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = BRAND.line2;
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";

    // wordmark
    ctx.fillStyle = BRAND.gold;
    ctx.font = `700 22px ${BRAND_MONO}`;
    ctx.fillText("F L E X W A L L", W / 2, 86);

    // rang géant — or pour le n°1, blanc sinon
    ctx.font = `700 180px ${BRAND_MONO}`;
    ctx.fillStyle = rank === 1 ? BRAND.goldBright : BRAND.ink;
    ctx.fillText("#" + String(rank).padStart(2, "0"), W / 2, 282);

    // nom + étoile fondateur
    ctx.fillStyle = BRAND.ink;
    ctx.font = "700 44px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif";
    ctx.fillText((founder ? "★ " : "") + name, W / 2, 360);

    // montant
    ctx.fillStyle = BRAND.gold;
    ctx.font = `700 52px ${BRAND_MONO}`;
    ctx.fillText("$" + amountUSD.toLocaleString("en-US"), W / 2, 432);

    // le prix pour prendre la place, encadré comme sur la carte Open Graph
    ctx.fillStyle = BRAND.ink;
    ctx.font = `700 30px ${BRAND_MONO}`;
    const cta = "TAKE IT FOR $" + (amountUSD + 1).toLocaleString("en-US");
    const ctaW = ctx.measureText(cta).width;
    ctx.strokeStyle = BRAND.gold;
    ctx.strokeRect(W / 2 - ctaW / 2 - 26, 500, ctaW + 52, 56);
    ctx.fillText(cta, W / 2, 537);

    setReady(true);
  }, [rank, name, amountUSD, founder]);

  function download() {
    const c = ref.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "flexwall-" + String(rank).padStart(2, "0") + ".png";
    a.click();
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); } catch {}
  }

  function postOnX() {
    const url = location.origin + location.pathname;
    window.open(xIntentUrl({ rank, amountUSD, url }), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="share-wrap">
      <canvas ref={ref} width={W} height={H} className="share-canvas" aria-label={"Share card for rank " + rank} />
      <div className="share-actions">
        <button className="btn-take" onClick={postOnX}>Post on X</button>
        <button className="btn-ghost" onClick={download} disabled={!ready}>Download PNG</button>
        <button className="btn-ghost" onClick={copyLink}>Copy link</button>
      </div>
    </div>
  );
}
