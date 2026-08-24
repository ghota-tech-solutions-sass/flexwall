import type { Metadata } from "next";
import Link from "next/link";
import ShareCard from "@/components/ShareCard";
import SeatViewPing from "@/components/SeatViewPing";
import { listEntriesSafe, rankEntries } from "@/lib/board-server";
import { dynamicFloor, formatUSD, founderSlugs } from "@/lib/board";
import { eventsForSlug, type WallEvent } from "@/lib/store/entries";
import SiteNav from "@/components/SiteNav";
import { identityLink } from "@/lib/identity-link";
import { LinkIcon, XLogo } from "@/components/OutLink";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ranked = rankEntries(await listEntriesSafe());
  const e = ranked.find((x) => x.slug === slug);
  if (!e) return { title: "Unknown seat", robots: { index: false, follow: true } };
  const rank = ranked.findIndex((x) => x.slug === slug) + 1;
  const title = e.name + " is #" + rank + " on flexwall.lol";
  const description =
    "#" + rank + ": " + e.name + ", $" + e.amountUSD.toLocaleString("en-US") +
    " on public display. Beat it.";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/share/" + slug },
    openGraph: { type: "profile", url: "/share/" + slug, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  void dynamicFloor; // le plancher s'affiche sur le mur, pas sur la carte
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  const idx = ranked.findIndex((x) => x.slug === slug);

  if (idx === -1) {
    return (
      <>
        <SiteNav variant="link" />
        <div className="page">
          <section className="hero">
            <p className="eyebrow">unknown seat</p>
            <h1 className="h1 serif">This place is still <em className="green">empty.</em></h1>
            <p className="subline">No one holds this name on the register. It could be yours.</p>
            <Link className="btn-primary" href="/?enter=1">Enter the list</Link>
          </section>
          <footer><span>flexwall.lol</span><span>no refunds</span></footer>
        </div>
      </>
    );
  }

  const e = ranked[idx];
  const rank = idx + 1;
  const founders = founderSlugs(entries);
  const total = entries.reduce((s, x) => s + x.amountUSD, 0);
  const out = identityLink(e.name);
  let history: WallEvent[] = [];
  try {
    history = await eventsForSlug(slug);
  } catch (error) {
    console.error("share history failed:", error);
  }
  const chronological = history.slice().reverse();

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 8 }}>
          <p className="eyebrow">share card</p>
          <h1 className="h1 serif" style={{ fontSize: "clamp(30px,4.5vw,46px)" }}>
            #{rank} · <em className="green">{e.name}</em>
          </h1>
          <p className="subline mono">
            {"$" + e.amountUSD.toLocaleString("en-US")} on public display. Download, post, dare someone.
          </p>
          {out ? (
            <p style={{ marginTop: 14 }}>
              <a className="btn-out" href={out.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                {out.kind === "x" ? <XLogo size={15} /> : <LinkIcon size={15} />}
                <span>{out.kind === "x" ? "Follow " + out.label.replace(" on X", "") + " on X" : "Visit " + out.label}</span>
              </a>
            </p>
          ) : null}
        </section>

        <ShareCard rank={rank} name={e.name} amountUSD={e.amountUSD} founder={founders.has(e.slug)} />

        <SeatViewPing slug={e.slug} />
        <div className="share-meta mono">
          <span>rank #{rank} of {ranked.length}</span>
          <span>·</span>
          <span>on the wall since {new Date(e.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
          {founders.has(e.slug) ? (<><span>·</span><span className="gold">★ founding 100</span></>) : null}
          {(e.views ?? 0) > 0 ? (
            <><span>·</span><span>{(e.views ?? 0).toLocaleString("en-US")} view{(e.views ?? 0) > 1 ? "s" : ""}</span></>
          ) : null}
        </div>

        {history.length > 0 ? (
          <div style={{ marginTop: 34, maxWidth: 640 }}>
            <div className="section-head">
              <span className="board-title" style={{ fontSize: 15 }}>Money trail</span>
              <span className="board-note mono">{history.length} payment{history.length > 1 ? "s" : ""} · public record</span>
            </div>
            <div className="list">
              {chronological.map((ev, i) => (
                <div className="rowi" key={ev.id}>
                  <span className="rk mono">{String(i + 1).padStart(2, "0")}</span>
                  <div className="hcell">
                    <span className="handle-md" style={{ fontSize: 15 }}>
                      {ev.type === "entry" ? "Entered the wall" : "Topped up"}
                    </span>
                    <div className="pass-hint">
                      {new Date(ev.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                  <div className="acell">
                    <div style={{ textAlign: "right" }}>
                      <span className="amt-md green">+{formatUSD(ev.amountUSD)}</span>
                      <div className="takeover">total: {formatUSD(ev.newTotalUSD)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="share-actions" style={{ justifyContent: "flex-start", marginTop: 30 }}>
          <Link className="btn-take" href={"/?enter=1&amount=" + (e.amountUSD + 1)}>
            Beat this seat for {formatUSD(e.amountUSD + 1)}
          </Link>
          <Link className="btn-ghost" href="/">← the wall</Link>
        </div>

        <footer><span>flexwall.lol · the open register</span><span>no refunds</span></footer>
      </div>
    </>
  );
}
