import type { Metadata } from "next";
import Link from "next/link";
import type { ExploreSort } from "@/application/use-cases/explore";
import { Footer, TopBar } from "@/components/site/Chrome";
import { container } from "@/composition";
import { formatNumber } from "@flexwall/sdk";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = {
  title: "The Wall",
  description: "Builders who show their real numbers. Ranked by verified revenue, streaks and stars.",
  alternates: { canonical: "/explore" },
};

export const dynamic = "force-dynamic";

const SORTS: { id: ExploreSort; label: string }[] = [
  { id: "recent", label: "Recently updated" },
  { id: "revenue", label: "Verified revenue" },
  { id: "streak", label: "Commit streak" },
  { id: "stars", label: "Stars" },
];

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const current = SORTS.find((s) => s.id === sort)?.id ?? "recent";
  const entries = await container().listExplore.execute({ sort: current });

  return (
    <div className="page">
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main>
        <div className="page-head">
          <h1 className="display">The Wall</h1>
          <p>People who build in public, with the numbers to show for it. Revenue ranks only count what an owner&apos;s own Stripe account says.</p>
        </div>
        <nav className="tabs" aria-label="Sort">
          {SORTS.map((s) => (
            <Link key={s.id} href={`/explore?sort=${s.id}`} aria-current={s.id === current ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
        {entries.length === 0 ? (
          <p className="empty">
            Nobody here yet. Publish your wall, tick &ldquo;List me on The Wall&rdquo;, and you&apos;re first. <Link href="/login">Make yours</Link>.
          </p>
        ) : (
          <ol className="explore-list">
            {entries.map((e, i) => (
              <li key={e.handle}>
                <Link href={`/@${e.handle}`}>
                  <span className="explore-rank">{i + 1}</span>
                  <span className="explore-who">
                    <strong>{e.title}</strong>
                    <span>
                      @{e.handle}
                      {e.bio ? <em className="explore-bio">{e.bio.slice(0, 80)}</em> : null}
                    </span>
                  </span>
                  <span className="explore-numbers">
                    {current !== "recent" && e.ranks[current] !== undefined ? (
                      <span>
                        <b>{(current === "revenue" ? "$" : "") + formatNumber(e.ranks[current]!)}</b>
                        <small>{SORTS.find((s) => s.id === current)!.label}</small>
                      </span>
                    ) : (
                      e.highlights.map((h) => (
                        <span key={h.label + h.value}>
                          <b>{h.value}</b>
                          <small>{h.label}</small>
                        </span>
                      ))
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
      <Footer />
    </div>
  );
}
