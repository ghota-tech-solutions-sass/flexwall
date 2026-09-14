import Link from "next/link";
import { TopBar, Footer } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { todayIn } from "@/domain/time";
import { demoWall, sampleStates } from "@/rendering/samples";
import { sessionUserId } from "@/presentation/http";

export const dynamic = "force-dynamic";

export default async function Home() {
  const c = container();
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  const theme = c.catalog.theme(wall.theme)!;
  const states = sampleStates(wall.tiles, c.catalog);
  const signedIn = Boolean(await sessionUserId());

  return (
    <>
      <div className="page">
        <TopBar signedIn={signedIn} />
        <section className="hero">
          <h1>Your numbers, live, on one page.</h1>
          <p>Tiles fed by the accounts that produce them: Stripe MRR, GitHub streaks, anything with an API. Drag them into a wall and put it in your bio.</p>
          <ClaimForm />
        </section>
      </div>

      <section aria-label="Example wall" style={{ ...wallStyle(theme), paddingBlock: "48px" }}>
        <div className="wall-inner" style={{ paddingBlock: 0 }}>
          <header className="wall-header">
            <div className="handle" style={{ color: theme.muted }}>flexwall.lol/@{wall.handle}</div>
            <h2 style={{ margin: "4px 0 8px", fontSize: "clamp(28px, 4vw, 40px)", fontFamily: theme.display.family }}>{wall.title}</h2>
            <p style={{ color: theme.muted, margin: 0 }}>{wall.bio}</p>
          </header>
          <WallGrids tiles={wall.tiles} states={states} theme={theme} today={today} catalog={c.catalog} />
        </div>
      </section>

      <div className="page">
        <section className="section">
          <h2>Build it once. It shows up everywhere.</h2>
          <p>The same tiles make your page, the card X unfolds when you share it, and a lock screen your iPhone redraws every morning.</p>
          <div className="surfaces">
            <figure>
              <img src="/demo/card.png" alt="The share card of the example wall" width={1200} height={630} loading="lazy" />
              <figcaption>The card when you post your wall. Always today&apos;s numbers.</figcaption>
            </figure>
            <figure>
              <img src="/demo/lockscreen.png" alt="The example wall as an iPhone lock screen" width={603} height={1311} loading="lazy" />
              <figcaption>Your lock screen, via one Shortcuts automation.</figcaption>
            </figure>
          </div>
        </section>

        <section className="section">
          <h2>Real numbers, from the source</h2>
          <p>Tiles read from your accounts carry a verified badge. Keys are encrypted, read-only, and never shown again. Missing a source? Connectors are open source: add one in a pull request.</p>
          <ul className="connector-list">
            {c.catalog.connectors().map((conn) => (
              <li key={conn.id}>
                <h3>
                  {conn.name}
                  {conn.verified ? <span className="badge quiet">verified</span> : null}
                  {conn.tier === "pro" ? <span className="badge">Pro</span> : null}
                </h3>
                <p>{conn.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2>Free to start. Pro when your numbers are worth showing.</h2>
          <p>Every public wall is free. Pro unlocks verified revenue, history charts, every theme and a clean lock screen.</p>
          <Link href="/pricing" className="btn btn-signal">
            See pricing
          </Link>
        </section>
      </div>

      <div className="page">
        <Footer />
      </div>
    </>
  );
}
