import Link from "next/link";
import { TopBar, Footer } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { todayIn } from "@/domain/time";
import { demoWall, sampleStates } from "@/rendering/samples";
import { sessionUserId } from "@/presentation/http";
import { SOURCE_URL } from "@/site";

export const dynamic = "force-dynamic";

const FEATURED_SOURCES = ["stripe", "github", "npm", "youtube"];

export default async function Home() {
  const c = container();
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  const theme = c.catalog.theme(wall.theme)!;
  const states = sampleStates(wall.tiles, c.catalog);
  const signedIn = Boolean(await sessionUserId());
  const connectors = c.catalog.connectors();
  const featured = FEATURED_SOURCES.flatMap((id) => connectors.filter((conn) => conn.id === id).map((conn) => conn.name));
  const others = connectors.length - featured.length;

  return (
    <>
      <div className="page">
        <TopBar signedIn={signedIn} />

        <section className="hero">
          <div className="hero-copy">
            <h1 className="display">Your numbers, live, on one page.</h1>
            <p>Connect Stripe, GitHub or any API, arrange the tiles, and publish flexwall.lol/@you. The numbers keep themselves up to date.</p>
            <ClaimForm />
            <p className="hero-sources">
              Reads from <strong>{featured.join(", ")}</strong>
              {others > 0 ? ` and ${others} more sources.` : "."}
            </p>
          </div>

          <figure className="board" aria-label="An example wall" style={{ margin: 0 }}>
            <figcaption className="board-head">
              <strong>flexwall.lol/@{wall.handle}</strong>
              <span className="live">Live, updated today</span>
            </figcaption>
            <div className="board-body" style={wallStyle(theme)}>
              <WallGrids tiles={wall.tiles} states={states} theme={theme} today={today} catalog={c.catalog} />
            </div>
          </figure>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="display">Build it once. It shows up everywhere.</h2>
            <p>The same tiles make your page, the card X shows when you post the link, and a lock screen your iPhone redraws every morning.</p>
          </div>
          <div className="surfaces">
            <figure>
              <img src="/demo/card.png" alt="The share card of the example wall" width={1200} height={630} loading="lazy" />
              <figcaption>
                <strong>Share card</strong> Today&apos;s numbers, every time the link is posted.
              </figcaption>
            </figure>
            <figure>
              <img src="/demo/lockscreen.png" alt="The example wall as an iPhone lock screen" width={603} height={1311} loading="lazy" />
              <figcaption>
                <strong>Lock screen</strong> Redrawn each morning by one Shortcuts automation.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="display">Real numbers, from the source.</h2>
            <p>
              A tile read from an account carries a verified mark. Keys are encrypted, read-only where the service allows it, and never shown again.
              {SOURCE_URL ? " Missing a source? Connectors are open source: add one in a pull request." : ""}
            </p>
          </div>
          <ul className="connector-list">
            {connectors.map((conn) => (
              <li key={conn.id}>
                <h3>{conn.name}</h3>
                <p>{conn.description}</p>
                <span className="tags">
                  {conn.verified ? <span className="badge quiet">Verified</span> : null}
                  {conn.tier === "pro" ? <span className="badge">Pro</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="display">Free to start. Pro when the numbers are worth showing.</h2>
            <p>Every public wall is free. Pro adds verified revenue, history charts, every theme and a lock screen without the mark.</p>
          </div>
          <div className="row">
            <Link href={signedIn ? "/edit" : "/login"} className="btn btn-signal">
              {signedIn ? "Edit my wall" : "Claim your wall"}
            </Link>
            <Link href="/pricing" className="btn">
              See pricing
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
