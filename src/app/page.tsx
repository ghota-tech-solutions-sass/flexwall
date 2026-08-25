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

function Bar({ pct, gold }: { pct: number; gold?: boolean }) {
  const w = Math.max(1.2, pct * 100);
  return (
    <div className="bar-wrap">
      <div
        className="bar-fill"
        style={{
          width: w + "%",
          background: gold
            ? "linear-gradient(90deg, rgba(200,164,87,.85), rgba(200,164,87,.25))"
            : "linear-gradient(90deg, rgba(156,179,128,.6), rgba(156,179,128,.15))",
        }}
      />
    </div>
  );
}

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
  const moveRank = lastMove ? new Map(rankEntries(entries).map((e, i) => [e.slug, i + 1])).get(lastMove.slug) : undefined;
  const total = totalOnDisplay(entries);
  const max = ranked.length > 0 ? Math.max(ranked[0].amountUSD, 1) : 1;
  const floor = dynamicFloor(ranked.length);
  const tierNote = tierNoteFor(ranked.length);
  const founders = founderSlugs(entries);

  const recent = entries
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  const rankOf = new Map(ranked.map((e, i) => [e.slug, i + 1]));
  const tickerItems = recent.length > 0 ? [...recent, ...recent] : [];

  const first = ranked[0];
  const second = ranked[1];
  const third = ranked[2];
  const rest = ranked.slice(3);

  // "+$X pour passer @y" — calculé côté serveur pour chaque ligne
  function passHint(i: number): { delta: number; target: string } | null {
    if (i === 0 || !ranked[i - 1]) return null;
    const above = ranked[i - 1];
    const me = ranked[i];
    const delta = above.amountUSD - me.amountUSD + 1;
    if (delta <= 0) return null;
    return { delta, target: above.name };
  }

  return (
    <>
      <SiteNav total={total} />

      <div className="page">
        {lastMove ? (
          <div className="livebar mono">
            <span className="livedot" />
            <span>
              <b>{lastMove.name}</b>{" "}
              {lastMove.type === "entry" ? "entered the wall" : "topped up"} with{" "}
              <span className="green">{formatUSD(lastMove.amountUSD)}</span>
              {moveRank ? <> · now #{moveRank}</> : null}
            </span>
            <span className="livebar-when">{timeAgo(lastMove.ts)}</span>
          </div>
        ) : null}
        <section className="hero">
          <p className="eyebrow"><span className="livedot" /> the open register of private fortunes · est. MMXXV</p>
          <h1 className="h1">
            Money,<em>ranked.</em>
          </h1>
          <p className="subline">
            One rule: <b>pick the name above yours, put up more money,
            take their place.</b> Every entry is public, permanent and paid.
            Minimum {formatUSD(floor)}{tierNote ? " (" + tierNote.replace("founding price, ", "") + ")" : ""}.
          </p>

          <div className="hero-ctas">
            {first ? (
              <button
                className="btn-take"
                data-open-entry
                data-amount={first.amountUSD + 1}
              >
                Take №01 for {formatUSD(first.amountUSD + 1)}
              </button>
            ) : (
              <button className="btn-take" data-open-entry>Be the first name</button>
            )}
            <span className="cta-note mono">
              Stripe checkout · ranked in seconds · permanent record
              {tierNote ? <b className="floor-chip"> ★ {tierNote}</b> : null}
            </span>
          </div>

          <div className="how-strip mono">
            <div className="how-step">
              <span className="how-n">01</span>
              <span className="how-t"><b>Pick a name.</b> An X handle, your real name, a company, or an alias.</span>
            </div>
            <div className="how-step">
              <span className="how-n">02</span>
              <span className="how-t"><b>Post the money.</b> Paid through Stripe, shown in public.</span>
            </div>
            <div className="how-step">
              <span className="how-n">03</span>
              <span className="how-t"><b>Defend your place.</b> Anyone can post more than you. The record keeps every name.</span>
            </div>
          </div>

          {tickerItems.length > 0 ? (
            <div className="ticker" aria-hidden="true">
              <div className="ticker-track">
                {tickerItems.map((e, i) => (
                  <span className="tick-item" key={e.slug + "-" + i}>
                    <Link className="name-link" href={"/share/" + e.slug}><b>{e.name}</b></Link> holds #{rankOf.get(e.slug) ?? "—"} ·{" "}
                    <span className="amt">{formatUSD(e.amountUSD)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section aria-label="leaderboard">
          <div className="section-head">
            <span className="board-title">The Wall</span>
            <span className="board-note mono">{ranked.length} {ranked.length === 1 ? "entry" : "entries"} · ties go to whoever arrived first</span>
          </div>

          {first ? (
            <article className="podium-top">
              <p className="crown">№ 01 · largest amount on the wall</p>
              <div className="who">
                <SeatAvatar entry={first} size="xl" />
                <Link className="handle-xl name-link" href={"/share/" + first.slug}>{first.name}</Link>
                <OutLink name={first.name} size={22} />
                {first.verified ? <span title="verified funds">✔</span> : null}
                <span className="amount-xl mono">{formatUSD(first.amountUSD)}</span>
              </div>
              <Bar pct={first.amountUSD / max} gold />
              <div className="podium-meta mono">
                {(() => {
                  const reign = computeReign(events, first.slug, first.createdAt);
                  return (
                    <>
                      <span>№01 for {reignDuration(reign.since)}</span>
                      {reign.challenges > 0 ? (
                        <>
                          <span>·</span>
                          <span>{reign.challenges} challenge{reign.challenges > 1 ? "s" : ""} seen off</span>
                        </>
                      ) : null}
                      <span>·</span>
                      <span>{Math.round((first.amountUSD / (total || 1)) * 100)}% of everything on this wall</span>
                      {(first.views ?? 0) > 0 ? (
                        <>
                          <span>·</span>
                          <span>{(first.views ?? 0).toLocaleString("en-US")} view{(first.views ?? 0) > 1 ? "s" : ""}</span>
                        </>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </article>
          ) : null}

          {second || third ? (
            <div className="podium-row">
              {[second, third].map((e, k) =>
                e ? (
                  <article className="podium-card" key={e.slug}>
                    <p className="rank-tag mono">№ 0{k + 2}</p>
                    <span className="podium-card-who">
                      <SeatAvatar entry={e} size="md" />
                      <Link className="handle-lg name-link" href={"/share/" + e.slug}>{e.name}</Link>
                      <OutLink name={e.name} />
                    </span>
                    <div className="amount-lg mono">{formatUSD(e.amountUSD)}</div>
                    {(e.views ?? 0) > 0 ? (
                      <div className="views-inline mono">{(e.views ?? 0).toLocaleString("en-US")} views</div>
                    ) : null}
                    <Bar pct={e.amountUSD / max} />
                  </article>
                ) : null
              )}
            </div>
          ) : null}

          <div className="list" style={{ marginTop: rest.length > 0 ? 26 : 0 }}>
            {rest.map((e, k) => {
              const i = k + 3;
              const hint = passHint(i);
              return (
                <div className="rowi" key={e.slug}>
                  <div
                    className="row-bar"
                    style={{ width: Math.max(1.5, (e.amountUSD / max) * 100) + "%" }}
                  />
                  <span className="rk mono">{String(i + 1).padStart(2, "0")}</span>
                  <div className="hcell">
                    <span className="handle-md">
                      <SeatAvatar entry={e} />
                      <Link className="name-link" href={"/share/" + e.slug}>{e.name}</Link>
                      <OutLink name={e.name} />
                      {founders.has(e.slug) ? <span className="fstar" title="founding 100">★</span> : null}
                      {e.verified ? <span className="vdot" title="verified funds" /> : null}
                    </span>
                    <div className="pass-hint">
                      {hint ? (
                        <>+{formatUSD(hint.delta)} passes <b>{hint.target}</b></>
                      ) : null}
                      {(e.views ?? 0) > 0 ? (
                        <span className="views-inline">{hint ? " · " : ""}{(e.views ?? 0).toLocaleString("en-US")} views</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="acell">
                    <div style={{ textAlign: "right" }}>
                      <span className="amt-md">{formatUSD(e.amountUSD)}</span>
                      <div className="takeover">
                        enter above: <b>{formatUSD(e.amountUSD + 1)}</b>
                      </div>
                    </div>
                    <button
                      className="row-claim"
                      data-open-entry
                      data-amount={e.amountUSD + 1}
                      title={"Surpass " + e.name + " for " + formatUSD(e.amountUSD + 1)}
                    >
                      surpass
                    </button>
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 ? (
              <div className="rowi">
                <span className="rk">—</span>
                <div className="hcell"><span className="handle-md" style={{ color: "var(--muted)" }}>the wall is empty. be first.</span></div>
                <span className="amt-md" />
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Link className="btn-ghost" href="/board">View the full register →</Link>
            <Link className="board-note mono" href="/how-it-works" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>read the rules</Link>
          </div>

          <p className="wallmark mono">flexwall.lol</p>
        </section>

        <div className="trust-rail">
          <div className="trust-card">
            <h4>Paid through Stripe</h4>
            <p>Checkout runs on Stripe. We never see or store your card.</p>
          </div>
          <div className="trust-card">
            <h4>Public by design</h4>
            <p>Names, amounts and ranks are visible to anyone, permanently.</p>
          </div>
          <div className="trust-card">
            <h4>Not a wealth ranking</h4>
            <p>The wall shows what people chose to post, not verified net worth.</p>
          </div>
          <div className="trust-card">
            <h4>No refunds</h4>
            <p>Entries are final. That is what a permanent public record costs.</p>
          </div>
        </div>

        <section className="why-block">
          <p className="section-label">Why people enter</p>
          <h3>
            Anyone can talk about money. Almost nobody will <em>put it on public display</em> to back it up.
          </h3>
          <div className="why-grid">
            <div className="why-card hot">
              <h5>Proof of nerve</h5>
              <p>Talking about money costs nothing. Posting it in public with no undo is a different thing. Your entry is dated, and it stays.</p>
            </div>
            <div className="why-card">
              <h5>A place worth defending</h5>
              <p>There is exactly one №02. Holding it costs nothing. Taking it from you costs more than you paid. Every day nobody passes you is a day you held.</p>
            </div>
            <div className="why-card">
              <h5>A permanent record</h5>
              <p>If someone passes you tomorrow, your name and amount stay in the register. Entries never disappear. They become the number the next person has to beat.</p>
            </div>
            <div className="why-card">
              <h5>Moves get noticed</h5>
              <p>Every takeover is a screenshot. Your name shows up in the live ticker, and every seat has a share card made for posting.</p>
            </div>
          </div>
        </section>

        <EntryModal floor={floor} tierNote={tierNote} paymentsConfigured={stripeEnabled()} board={ranked} />

        <SiteFooter left="flexwall.lol · season I" />
      </div>
    </>
  );
}
