import Link from "next/link";
import { compactUSD, formatUSD } from "@/lib/board";

/**
 * Navigation commune. Le CTA ouvre la modale d'entrée quand la page monte
 * EntryModal (variant="modal"), sinon il renvoie vers l'accueil avec ?enter=1,
 * qui ouvre la modale à l'arrivée (variant="link").
 */
/** Chip "total on the wall": exact below $10k (compact reads oddly small), compact above. */
function totalLabel(totalUSD: number): string {
  return totalUSD >= 10_000 ? compactUSD(totalUSD) : formatUSD(totalUSD);
}

export default function SiteNav({
  total,
  variant = "modal",
}: {
  /** Somme de tous les montants affichés sur le mur, en USD. */
  total?: number;
  variant?: "modal" | "link";
}) {
  return (
    <div className="topbar">
      <div className="topbar-in">
        <Link className="wordmark" href="/">FLEXWALL.LOL</Link>
        <nav className="links">
          <Link href="/">Wall</Link>
          <Link href="/board">Full register</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/me">My seat</Link>
          <Link href="/about">About</Link>
        </nav>
        {typeof total === "number" && total > 0 ? (
          <span className="total-chip" title="Total amount posted on the wall">
            <span className="gold mono">{totalLabel(total)}</span> on the wall
          </span>
        ) : <span />}
        {variant === "modal" ? (
          <button className="btn-primary" data-open-entry>Enter the list</button>
        ) : (
          <Link className="btn-primary" href="/?enter=1">Enter the list</Link>
        )}
      </div>
    </div>
  );
}
