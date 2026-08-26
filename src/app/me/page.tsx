import type { Metadata } from "next";
import { cookies } from "next/headers";
import SeatLookup from "@/components/SeatLookup";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { listEntriesSafe, totalOnDisplay } from "@/lib/board-server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My seat",
  description: "Find your place on the wall.",
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
  const total = totalOnDisplay(await listEntriesSafe());

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 20 }}>
          <p className="eyebrow">{welcome ? "payment received" : "my seat · private by default"}</p>
          <h1 className="h1" style={{ fontSize: "clamp(34px,5vw,52px)" }}>
            {welcome ? (
              <>You are <em>on the wall.</em></>
            ) : (
              <>Your money, <em>your place.</em></>
            )}
          </h1>
          <p className="subline">
            Your rank, your payments, and who sits right above you.
            {authedSlug
              ? " Your session is active."
              : " Pay from this browser and your seat opens here on its own. From anywhere else, ask for a link by email."}
          </p>
        </section>
        <SeatLookup authedSlug={authedSlug} welcome={welcome} linkExpired={linkExpired} />
        <SiteFooter />
      </div>
    </>
  );
}
