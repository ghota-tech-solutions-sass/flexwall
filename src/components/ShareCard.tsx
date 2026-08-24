"use client";

import { useEffect, useRef, useState } from "react";
import { xIntentUrl } from "@/lib/share";

interface Props {
  rank: number;
  name: string;
  amountUSD: number;
  founder: boolean;
}

const W = 1200;
const H = 675;

/** Carte de partage 1200×675 dessinée en canvas — chaque rang devient un post. */
export default function ShareCard({ rank, name, amountUSD, founder }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // fond
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(0, 0, W, H);
    // cadre fin
    ctx.strokeStyle = "#23262b";
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    // accent vertical vert
    ctx.fillStyle = "#35d07f";
    ctx.fillRect(14, H / 2 - 60, 4, 120);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";

    // eyebrow
    ctx.fillStyle = "#8b929c";
    ctx.font = "600 19px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("F L E X W A L L . L O L", W / 2, 92);

    // rang géant — or pour le n°1, vert sinon
    ctx.font = "italic 700 210px Georgia, 'Times New Roman', serif";
    ctx.fillStyle = rank === 1 ? "#e6c37c" : "#35d07f";
    ctx.fillText("#" + String(rank).padStart(2, "0"), W / 2, 320);

    // nom + étoile fondateur
    ctx.fillStyle = "#f2f3f5";
    ctx.font = "600 46px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText((founder ? "★ " : "") + name, W / 2, 402);

    // montant
    ctx.fillStyle = "#35d07f";
    ctx.font = "500 44px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("$" + amountUSD.toLocaleString("en-US"), W / 2, 470);

    // séparateur
    ctx.strokeStyle = "#23262b";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 220, 520);
    ctx.lineTo(W / 2 + 220, 520);
    ctx.stroke();

    // footer
    ctx.fillStyle = "#6a707a";
    ctx.font = "400 22px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("the open register of private fortunes · no refunds", W / 2, 585);

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
