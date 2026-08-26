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
          background: "#000000",
          color: "#e7e9ea",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ position: "absolute", top: 20, left: 20, right: 20, bottom: 20, border: "1px solid #2f3336", display: "flex" }} />
        <div style={{ fontSize: 26, letterSpacing: 6, color: "#e2b340", marginBottom: 28 }}>FLEXWALL.LOL</div>
        {e ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 190, fontWeight: 800, color: rank === 1 ? "#f2c75c" : "#e7e9ea", lineHeight: 1 }}>
              {"#" + String(rank).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 48, fontWeight: 600, marginTop: 18 }}>{e.name}</div>
            <div style={{ fontSize: 44, color: "#e2b340", marginTop: 10 }}>
              {"$" + Math.round(e.amountUSD).toLocaleString("en-US")}
            </div>
            {founder ? (
              <div style={{ marginTop: 16, fontSize: 20, letterSpacing: 6, color: "#f2c75c", border: "1px solid #2f3336", padding: "6px 16px" }}>
                FOUNDING 100
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 60, fontWeight: 700, color: "#8b98a5" }}>this seat is still empty</div>
        )}
        <div style={{ position: "absolute", bottom: 44, fontSize: 24, color: "#71767b", display: "flex" }}>
          the open register of private fortunes · no refunds
        </div>
      </div>
    ),
    size
  );
}
