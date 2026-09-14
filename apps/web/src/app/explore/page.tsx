import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopBar } from "@/components/site/Chrome";
import { EmptyWall, RankTable, WallCard } from "@/components/explore/WallCards";
import { JsonLd } from "@/components/seo/JsonLd";
import { container } from "@/composition";
import { EXPLORE_SORTS, exploreSort } from "@/presentation/explore/boards";
import { sessionUserId } from "@/presentation/http";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { breadcrumbLd, itemListLd } from "@/presentation/seo/structured-data";

export const metadata: Metadata = pageMetadata({
  title: "The Wall",
  description: "Builders who show their real numbers. Ranked by verified revenue, audience, streaks and stars.",
  path: "/explore",
});

export const dynamic = "force-dynamic";

const PODIUM = 3;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const current = exploreSort((await searchParams).sort);
  const c = container();
  const [entries, userId] = await Promise.all([c.listExplore.execute({ sort: current }), sessionUserId()]);
  const signedIn = Boolean(userId);
  const now = Date.now();
  const sort = EXPLORE_SORTS.find((s) => s.id === current)!;
  const themeOf = (id: string) => c.catalog.theme(id) ?? c.catalog.theme("daylight")!;
  const board = current === "recent" ? null : current;

  return (
    <div className="page">
      <JsonLd
        data={[
          breadcrumbLd(siteOrigin(), [
            { name: "Flexwall", path: "/" },
            { name: "The Wall", path: "/explore" },
          ]),
          itemListLd(
            siteOrigin(),
            sort.label,
            entries.map((e) => ({ name: e.title || `@${e.handle}`, path: `/@${e.handle}` }))
          ),
        ]}
      />
      <TopBar signedIn={signedIn} />
      <main>
        <header className="wall-head dotted">
          <div>
            <h1 className="display">The Wall</h1>
            <p>People who build in public, with the numbers to show for it. Revenue ranks only count what an owner&apos;s own Stripe, Lemon Squeezy or Polar account says.</p>
          </div>
          <Link href={signedIn ? "/edit" : "/login"} className="btn">
            {signedIn ? "List my wall" : "Add your wall"}
          </Link>
        </header>

        <nav className="tabs" aria-label="Sort">
          {EXPLORE_SORTS.map((s) => (
            <Link key={s.id} href={`/explore?sort=${s.id}`} aria-current={s.id === current ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>

        {entries.length === 0 ? (
          current === "recent" ? (
            <EmptyWall signedIn={signedIn} />
          ) : (
            <div className="empty">
              <p>
                Nobody ranks on {sort.unit} yet. <Link href="/explore">See every wall</Link>.
              </p>
            </div>
          )
        ) : board ? (
          <>
            <ol className="wall-grid-cards podium">
              {entries.slice(0, PODIUM).map((e, i) => (
                <li key={e.handle}>
                  <WallCard entry={e} theme={themeOf(e.theme)} now={now} rank={i + 1} board={board} />
                </li>
              ))}
            </ol>
            {entries.length > PODIUM ? <RankTable entries={entries.slice(PODIUM)} board={board} start={PODIUM + 1} now={now} /> : null}
          </>
        ) : (
          <ul className="wall-grid-cards">
            {entries.map((e) => (
              <li key={e.handle}>
                <WallCard entry={e} theme={themeOf(e.theme)} now={now} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
