import type { Metadata } from "next";
import Link from "next/link";
import SeatAvatar from "@/components/SeatAvatar";
import ShareCard from "@/components/ShareCard";
import SeatViewPing from "@/components/SeatViewPing";
import { listEntriesSafe, rankEntries } from "@/lib/board-server";
import { dynamicFloor, formatUSD, founderSlugs, tierNote } from "@/lib/board";
import { stripeEnabled } from "@/lib/env";
import EntryModal from "@/components/EntryModal";
import { eventsForSlug, type WallEvent } from "@/lib/store/entries";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { identityLink } from "@/lib/identity-link";
import { LinkIcon, XLogo } from "@/components/OutLink";
import { SITE_NAME, X_CREATOR } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ranked = rankEntries(await listEntriesSafe());
  const e = ranked.find((x) => x.slug === slug);
  if (!e) {
    return {
      title: "Unknown spot",
      description: "Nobody holds this name on the wall. It could be yours.",
      alternates: { canonical: "/share/" + slug },
      robots: { index: false, follow: true },
    };
  }
  const rank = ranked.findIndex((x) => x.slug === slug) + 1;
  const amount = "$" + e.amountUSD.toLocaleString("en-US");
  const next = "$" + (e.amountUSD + 1).toLocaleString("en-US");
  const title = `${e.name} is #${rank} on ${SITE_NAME}`;
  const description = `${e.name} paid ${amount} to be #${rank}. Take it for ${next}.`;
  // Le montant sert de cache-buster : X, Slack et iMessage indexent l'image
  // OG par URL. Sans lui, la preview d'une place reste figée sur le montant
  // du premier scrape — or c'est justement le nombre qui doit bouger.
  const image = {
    url: `/share/${slug}/opengraph-image?v=${e.amountUSD}`,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: `${e.name} is #${rank} on Flexwall for ${amount}.`,
  };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/share/" + slug },
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      locale: "en_US",
      url: "/share/" + slug,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
      creator: X_CREATOR,
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  const idx = ranked.findIndex((x) => x.slug === slug);

  if (idx === -1) {
    return (
      <>
        <SiteNav variant="link" />
        <div className="page">
          <section className="hero">
            <p className="eyebrow">unknown spot</p>
            <h1 className="h1">Nobody here <em>yet.</em></h1>
            <p className="subline">This name isn&rsquo;t on the wall. It could be.</p>
            <Link className="btn-primary" href="/?enter=1">Take a spot</Link>
          </section>
          <SiteFooter left="flexwall.lol" />
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
          <p className="eyebrow">a spot on the wall</p>
          <h1 className="h1 seat-head" style={{ fontSize: "clamp(30px,4.5vw,46px)" }}>
            <SeatAvatar entry={e} size="xl" />
            <span>#{rank} · <em className="green">{e.name}</em></span>
          </h1>
          <p className="me-amount mono">{formatUSD(e.amountUSD)}</p>
          {/* Le visiteur arrive ici depuis X sans rien savoir du site : lui dire
              ce que c'est et ce qu'il peut faire, avant les outils du titulaire. */}
          <p className="subline">
            {e.name} paid {formatUSD(e.amountUSD)} to sit at #{rank} of {ranked.length} on
            flexwall.lol — a leaderboard where your rank is whatever you paid.
            Anyone can take this spot.
          </p>
          <div className="share-actions" style={{ justifyContent: "flex-start", marginTop: 18 }}>
            <button className="btn-outbid btn-outbid-xl mono" data-open-entry data-amount={e.amountUSD + 1}>
              OUTBID FOR {formatUSD(e.amountUSD + 1)}
            </button>
          </div>
          {e.linkTitle || e.linkDescription ? (
            <p className="seat-site">
              {e.linkTitle}
              {e.linkTitle && e.linkDescription ? " — " : ""}
              {e.linkDescription}
            </p>
          ) : null}
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
        <div className="share-meta">
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
              <span className="board-note">{history.length} payment{history.length > 1 ? "s" : ""} · public record</span>
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
                    <div className="trail-amounts">
                      <span className="amt-md green">+{formatUSD(ev.amountUSD)}</span>
                      <span className="trail-total">total {formatUSD(ev.newTotalUSD)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="share-actions" style={{ justifyContent: "flex-start", marginTop: 30 }}>
          <button className="btn-outbid mono" data-open-entry data-amount={e.amountUSD + 1}>
            OUTBID FOR {formatUSD(e.amountUSD + 1)}
          </button>
          <Link className="btn-ghost" href="/">← the wall</Link>
        </div>

        <EntryModal
          floor={dynamicFloor(ranked.length)}
          tierNote={tierNote(ranked.length)}
          paymentsConfigured={stripeEnabled()}
          board={ranked}
        />
        <SiteFooter />
      </div>
    </>
  );
}
