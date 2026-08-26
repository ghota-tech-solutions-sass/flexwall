import { ImageResponse } from "next/og";
import { listEntriesSafe, rankEntries } from "@/lib/board-server";
import { BRAND } from "@/lib/brand";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A spot on the Flexwall leaderboard";

/** Dynamic share card: the seat's rank and amount, matching the canvas card. */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  const idx = ranked.findIndex((e) => e.slug === slug);
  const e = idx >= 0 ? ranked[idx] : null;
  const rank = idx + 1;

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
          background: BRAND.bg,
          color: BRAND.ink,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ position: "absolute", top: 20, left: 20, right: 20, bottom: 20, border: `1px solid ${BRAND.line2}`, display: "flex" }} />
        <div style={{ fontSize: 26, letterSpacing: 6, color: BRAND.gold, marginBottom: 28 }}>FLEXWALL.LOL</div>
        {e ? (
          // Le bandeau du prix étant ancré en bas, la colonne ne doit pas
          // grandir sous le montant : l'étoile fondateur tient dans le nom.
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 70 }}>
            <div style={{ fontSize: 168, fontWeight: 800, color: rank === 1 ? BRAND.goldBright : BRAND.ink, lineHeight: 1 }}>
              {"#" + String(rank).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 24, color: BRAND.muted, marginTop: 4 }}>
              {"of " + ranked.length + " on the wall"}
            </div>
            {/* Pas d'étoile fondateur ici : le rendu serveur n'a pas le glyphe
                et affiche un tofu. Le nom, le montant et le prix suffisent. */}
            <div style={{ fontSize: 46, fontWeight: 600, marginTop: 14 }}>{e.name}</div>
            <div style={{ fontSize: 54, fontWeight: 700, color: BRAND.gold, marginTop: 8 }}>
              {"$" + Math.round(e.amountUSD).toLocaleString("en-US")}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 60, fontWeight: 700, color: BRAND.muted }}>this spot is still empty</div>
        )}
        {/* Le prix pour prendre la place est la raison d'être de la carte :
            il se lit avant le reste, pas en note de bas de page. */}
        <div
          style={{
            position: "absolute", bottom: 40, display: "flex",
            fontSize: 34, color: BRAND.ink, letterSpacing: 1,
            border: `1px solid ${BRAND.gold}`, padding: "12px 30px",
          }}
        >
          {e
            ? "TAKE IT FOR $" + (e.amountUSD + 1).toLocaleString("en-US")
            : "PAY MORE. TAKE THE SPOT."}
        </div>
      </div>
    ),
    size
  );
}
