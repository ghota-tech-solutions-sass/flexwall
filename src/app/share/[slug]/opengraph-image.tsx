import { ImageResponse } from "next/og";
import { listEntriesSafe, rankEntries } from "@/lib/board-server";
import { founderSlugs } from "@/lib/board";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "flexwall.lol share card";

/** Dynamic share card: the seat's rank and amount, matching the canvas card. */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  const idx = ranked.findIndex((e) => e.slug === slug);
  const e = idx >= 0 ? ranked[idx] : null;
  const rank = idx + 1;
  const founder = e ? founderSlugs(entries).has(e.slug) : false;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0e0a",
          color: "#eae3d0",
          fontFamily: "serif",
        }}
      >
        <div style={{ position: "absolute", top: 14, left: 14, right: 14, bottom: 14, border: "2px solid #3d3620", display: "flex" }} />
        <div style={{ position: "absolute", top: 24, left: 24, right: 24, bottom: 24, border: "1px solid #292519", display: "flex" }} />
        <div style={{ fontSize: 26, letterSpacing: 18, color: "#c8a457", marginBottom: 28 }}>✦ FLEXWALL.LOL ✦</div>
        {e ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 190, fontStyle: "italic", fontWeight: 700, color: rank === 1 ? "#e0bf74" : "#eae3d0", lineHeight: 1 }}>
              {"#" + String(rank).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 48, fontWeight: 600, marginTop: 18 }}>{e.name}</div>
            <div style={{ fontSize: 44, color: "#c8a457", marginTop: 10 }}>
              {"$" + Math.round(e.amountUSD).toLocaleString("en-US")}
            </div>
            {founder ? (
              <div style={{ marginTop: 16, fontSize: 20, letterSpacing: 6, color: "#e0bf74", border: "1px solid #4a4030", padding: "6px 16px" }}>
                FOUNDING 100
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 64, fontStyle: "italic", color: "#a2977c" }}>this seat is still empty</div>
        )}
        <div style={{ position: "absolute", bottom: 44, fontSize: 24, color: "#6b6250", display: "flex" }}>
          the open register of private fortunes · no refunds
        </div>
      </div>
    ),
    size
  );
}
