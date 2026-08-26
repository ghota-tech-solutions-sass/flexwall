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

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#2f3336";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";

    // wordmark
    ctx.fillStyle = "#e2b340";
    ctx.font = "700 22px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif";
    ctx.fillText("FLEXWALL.LOL", W / 2, 92);

    // rang géant — ambre pour le n°1, blanc sinon
    ctx.font = "800 200px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif";
    ctx.fillStyle = rank === 1 ? "#f2c75c" : "#e7e9ea";
    ctx.fillText("#" + String(rank).padStart(2, "0"), W / 2, 320);

    // nom + étoile fondateur
    ctx.fillStyle = "#e7e9ea";
    ctx.font = "700 46px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif";
    ctx.fillText((founder ? "★ " : "") + name, W / 2, 402);

    // montant
    ctx.fillStyle = "#e2b340";
    ctx.font = "500 44px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("$" + amountUSD.toLocaleString("en-US"), W / 2, 470);

    // séparateur
    ctx.strokeStyle = "#2f3336";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 220, 520);
    ctx.lineTo(W / 2 + 220, 520);
    ctx.stroke();

    // footer
    ctx.fillStyle = "#71767b";
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
