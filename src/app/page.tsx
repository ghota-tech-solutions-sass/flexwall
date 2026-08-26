import EntryModal from "@/components/EntryModal";
import SiteNav from "@/components/SiteNav";
import OutLink from "@/components/OutLink";
import SeatAvatar from "@/components/SeatAvatar";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";
import { totalOnDisplay, listEntriesSafe, rankEntries } from "@/lib/board-server";
import { listEvents, type WallEvent } from "@/lib/store/entries";
import { computeReign, reignDuration, timeAgo } from "@/lib/reign";
import { dynamicFloor, formatUSD, founderSlugs, tierNote as tierNoteFor } from "@/lib/board";
import { stripeEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const entries = await listEntriesSafe();
  const ranked = rankEntries(entries);
  let events: WallEvent[] = [];
  try {
    events = await listEvents(1000);
  } catch (error) {
    console.error("events unavailable:", error);
  }
  const lastMove = events[0];
  const moveRank = lastMove ? new Map(ranked.map((e, i) => [e.slug, i + 1])).get(lastMove.slug) : undefined;
  const total = totalOnDisplay(entries);
  const floor = dynamicFloor(ranked.length);
  const tierNote = tierNoteFor(ranked.length);
  const founders = founderSlugs(entries);

  const first = ranked[0];
  const rest = ranked.slice(1);

  return (
    <>
      <SiteNav total={total} />

      <div className="page">
        <section className="hero">
          <h1 className="h1">
            The internet&rsquo;s most expensive leaderboard.
          </h1>
          <p className="hero-sub">
            Pay more. Take the spot.{" "}
            <span className="hero-sub-dim">Someone can always outbid you.</span>
          </p>
          <div className="hero-ctas">
            <button className="btn-take" data-open-entry data-amount={floor}>
              Get on the wall — {formatUSD(floor)}
            </button>
          </div>
          <p className="cta-note">
            Stripe checkout · no account · no refunds
            {tierNote ? <> · {tierNote}</> : null}
          </p>
        </section>

        {lastMove ? (
          <div className="livebar">
            <span className="livedot" />
            <span>
              <b>{lastMove.name}</b> paid{" "}
              <span className="gold mono">{formatUSD(lastMove.amountUSD)}</span>
              {moveRank ? <> · now #{moveRank}</> : null}
            </span>
            <span className="livebar-when">{timeAgo(lastMove.ts)}</span>
          </div>
        ) : null}

        <section aria-label="leaderboard" className="wall">
          {first ? (
            <article className="top-seat">
              <div className="top-head">
                <span className="top-rank mono">#1</span>
                {(() => {
                  const reign = computeReign(events, first.slug, first.createdAt);
                  return (
                    <span className="top-meta">
                      held for {reignDuration(reign.since)}
                      {reign.challenges > 0
                        ? ` · ${reign.challenges} challenge${reign.challenges > 1 ? "s" : ""} survived`
                        : ""}
                    </span>
                  );
                })()}
              </div>
              <div className="top-who">
                <SeatAvatar entry={first} size="xl" />
                <Link className="top-name name-link" href={"/share/" + first.slug}>{first.name}</Link>
                <OutLink name={first.name} size={20} />
                {first.verified ? <span title="verified funds">✔</span> : null}
              </div>
              <div className="top-amount mono">{formatUSD(first.amountUSD)}</div>
              <button
                className="btn-outbid btn-outbid-xl mono"
                data-open-entry
                data-amount={first.amountUSD + 1}
              >
                OUTBID FOR {formatUSD(first.amountUSD + 1)}
              </button>
              <p className="top-note">
                Pay {formatUSD(first.amountUSD + 1)} and this spot is yours. Until it isn&rsquo;t.
              </p>
            </article>
          ) : (
            <article className="top-seat">
              <div className="top-head">
                <span className="top-rank mono">#1</span>
                <span className="top-meta">nobody. yet.</span>
              </div>
              <div className="top-amount mono top-amount-empty">$0</div>
              <button className="btn-outbid btn-outbid-xl mono" data-open-entry data-amount={floor}>
                TAKE #1 FOR {formatUSD(floor)}
              </button>
              <p className="top-note">The wall is empty. This is the cheapest #1 will ever be.</p>
            </article>
          )}

          <div className="list">
            {rest.map((e, k) => {
              const rank = k + 2;
              return (
                <div className="rowi" key={e.slug}>
                  <span className="rk mono">#{rank}</span>
                  <div className="hcell">
                    <span className="handle-md">
                      <SeatAvatar entry={e} />
                      <Link className="name-link" href={"/share/" + e.slug}>{e.name}</Link>
                      <OutLink name={e.name} />
                      {founders.has(e.slug) ? <span className="fstar" title="founding 100">★</span> : null}
                      {e.verified ? <span className="vdot" title="verified funds" /> : null}
                    </span>
                    {(e.views ?? 0) > 0 ? (
                      <div className="pass-hint">
                        <span className="views-inline">{(e.views ?? 0).toLocaleString("en-US")} views</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="acell">
                    <span className="amt-md mono">{formatUSD(e.amountUSD)}</span>
                    <button
                      className="btn-outbid mono"
                      data-open-entry
                      data-amount={e.amountUSD + 1}
                      title={"Take #" + rank + " from " + e.name + " for " + formatUSD(e.amountUSD + 1)}
                    >
                      OUTBID {formatUSD(e.amountUSD + 1)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {ranked.length > 1 ? (
            <div className="wall-foot">
              <Link className="wall-foot-link" href="/board">full list →</Link>
              <Link className="wall-foot-link" href="/how-it-works">the rules</Link>
            </div>
          ) : null}

          <p className="wallmark mono">flexwall.lol</p>
        </section>

        <section className="no-prize">
          <p>There is no prize.</p>
          <p>There are no perks.</p>
          <p className="no-prize-punch">You just wanted the spot.</p>
        </section>

        <section className="terms">
          <p className="terms-text">
            Payment runs on <b>Stripe</b> — we never see your card. Every name, amount
            and rank is <b>public, permanently</b>. The wall shows what people paid to
            be here, not what they&rsquo;re worth. <b>No refunds.</b>
          </p>
        </section>

        <EntryModal floor={floor} tierNote={tierNote} paymentsConfigured={stripeEnabled()} board={ranked} />

        <SiteFooter />
      </div>
    </>
  );
}
