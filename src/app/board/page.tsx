import type { Metadata } from "next";
import RegisterTable from "@/components/RegisterTable";
import SiteNav from "@/components/SiteNav";
import EntryModal from "@/components/EntryModal";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import { formatUSD, listEntriesSafe, rankEntries, totalOnDisplay } from "@/lib/board-server";
import { dynamicFloor, founderSlugs, tierNote } from "@/lib/board";
import { stripeEnabled } from "@/lib/env";
import { pageMetadata } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "The full list",
  description: "Every name on the wall, ranked by what they paid. Anyone can be outbid.",
  path: "/board",
});

export default async function BoardPage() {
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  const total = totalOnDisplay(entries);

  return (
    <>
      <SiteNav total={total} />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 10 }}>
          <p className="eyebrow"><span className="livedot" /> the full list · live</p>
          <h1 className="h1" style={{ fontSize: "clamp(28px,4.5vw,44px)" }}>
            Every name. <em>Every dollar.</em>
          </h1>
          <p className="subline">
            {ranked.length} {ranked.length === 1 ? "name" : "names"} · {formatUSD(total)} paid onto the wall.
            Search a name. The list refreshes on its own.
          </p>
        </section>

        <RegisterTable initial={ranked} founders={[...founderSlugs(entries)]} />

        <EntryModal floor={dynamicFloor(ranked.length)} tierNote={tierNote(ranked.length)} paymentsConfigured={stripeEnabled()} board={ranked} />

        <div style={{ marginTop: 26 }}>
          <Link className="btn-ghost" href="/">← back to the wall</Link>
        </div>

        <SiteFooter />
      </div>
    </>
  );
}
