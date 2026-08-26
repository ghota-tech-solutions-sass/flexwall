import type { Metadata } from "next";
import { cookies } from "next/headers";
import SeatLookup from "@/components/SeatLookup";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { listEntriesSafe, rankEntries, totalOnDisplay } from "@/lib/board-server";
import { formatUSD } from "@/lib/board";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My spot",
  description: "Find your spot on the wall.",
  robots: { index: false, follow: false },
};

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; link?: string }>;
}) {
  const cookieStore = await cookies();
  const authedSlug = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const sp = await searchParams;
  const welcome = sp.welcome === "1";
  const linkExpired = sp.link === "expired";
  const entries = await listEntriesSafe();
  const total = totalOnDisplay(entries);

  // Le rang est déjà là, côté serveur : l'afficher tout de suite plutôt que
  // d'attendre le fetch client, sinon l'instant qui suit le paiement — le seul
  // moment où la personne regarde vraiment — est une page sans son numéro.
  const ranked = rankEntries(entries);
  const idx = authedSlug ? ranked.findIndex((e) => e.slug === authedSlug) : -1;
  const mine = idx >= 0 ? ranked[idx] : null;

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 20 }}>
          <p className="eyebrow">{welcome ? "payment received" : "my spot · only you see this"}</p>
          {mine ? (
            <>
              <h1 className="h1 mono" style={{ fontSize: "clamp(36px,7vw,68px)" }}>
                YOU&rsquo;RE <em>#{idx + 1}</em>
              </h1>
              <p className="me-amount mono">{formatUSD(mine.amountUSD)}</p>
              <p className="subline">
                {welcome ? <b>Good luck keeping it.</b> : <>{mine.name} · your spot on the wall.</>}
              </p>
            </>
          ) : (
            <>
              <h1 className="h1" style={{ fontSize: "clamp(28px,4.5vw,44px)" }}>
                {welcome ? <>You&rsquo;re <em>on the wall.</em></> : <>Your spot.</>}
              </h1>
              <p className="subline">
                {welcome
                  ? "Good luck keeping it."
                  : "Your rank, your payments, and who sits right above you. Paid from this browser? Your spot loads on its own. Anywhere else, get a link by email."}
              </p>
            </>
          )}
        </section>
        <SeatLookup authedSlug={authedSlug} welcome={welcome} linkExpired={linkExpired} />
        <SiteFooter />
      </div>
    </>
  );
}
