import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { JsonLd } from "@/components/seo/JsonLd";
import { TopBar, Footer } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { ProfileHeader } from "@/components/wall/ProfileHeader";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { todayIn } from "@/domain/time";
import { demoWall, sampleStates } from "@/rendering/samples";
import { sessionUserId } from "@/presentation/http";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { integrationPath } from "@/presentation/seo/integrations";
import { organizationLd, SITE_DESCRIPTION, websiteLd } from "@/presentation/seo/structured-data";
import { SOURCE_URL } from "@/site";

export const metadata: Metadata = pageMetadata({ title: "Flexwall: your numbers, live, on one page", absoluteTitle: true, description: SITE_DESCRIPTION, path: "/" });

export const dynamic = "force-dynamic";

export default async function Home() {
  const c = container();
  const now = Date.now();
  const today = todayIn("UTC", now);
  const wall = demoWall(today);
  const light = c.catalog.theme(wall.theme)!;
  const dark = c.catalog.theme("midnight") ?? light;
  const states = sampleStates(wall.tiles, c.catalog);
  const signedIn = Boolean(await sessionUserId());
  const connectors = c.catalog.connectors();
  const date = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <JsonLd data={[organizationLd(siteOrigin()), websiteLd(siteOrigin())]} />
      <div className="page">
        <TopBar signedIn={signedIn} />

        <main id="main">
          <section className="hero">
            <div className="hero-copy">
              <h1 className="display">Flex your real numbers.</h1>
              <p>Stripe revenue, GitHub streaks and any API, live on flexwall.lol/@you and on your lock screen.</p>
              <ClaimForm />
            </div>

            <div className="phone-stage">
              <div className="device" role="img" aria-label="An iPhone lock screen showing live Flexwall widgets">
                <div className="device-screen">
                  <span className="device-island" />
                  <picture>
                    <source srcSet="/demo/lockscreen-dark.png?v=2" media="(prefers-color-scheme: dark)" />
                    <img src="/demo/lockscreen.png?v=2" alt="" width={603} height={1311} fetchPriority="high" />
                  </picture>
                  <div className="device-clock only-light">
                    <div>{date}</div>
                    <div>9:41</div>
                  </div>
                  <div className="device-clock only-dark" style={{ ["--clock" as string]: "#f5f5f7" }}>
                    <div>{date}</div>
                    <div>9:41</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <nav className="logos reveal" aria-label="Sources">
            {connectors
              .filter((conn) => hasMark(conn.id))
              .map((conn) => (
                <Link key={conn.id} href={integrationPath(conn.id)} aria-label={conn.name} title={conn.name}>
                  <BrandMark id={conn.id} size={30} />
                </Link>
              ))}
          </nav>

          <section className="section reveal" aria-labelledby="everywhere">
            <h2 id="everywhere" className="display">
              One wall. Every place people look.
            </h2>
            <p className="section-lede">Build it once. The same tiles make your page, your share card and your lock screen.</p>

            <div className="bento">
              <article className="cell cell-page">
                <div className="cell-core">
                  <h3>A page that keeps itself current</h3>
                  <p>Tiles redraw from the source, so the numbers on flexwall.lol/@you are never an old screenshot.</p>
                  <div className="mini-wall board only-light" style={wallStyle(light)}>
                    <ProfileHeader as="h4" title={wall.title} handle={wall.handle} bio={wall.bio} theme={light} stats={[{ value: "3", label: "verified numbers" }]} />
                    <WallGrids tiles={wall.tiles} states={states} theme={light} today={today} catalog={c.catalog} />
                  </div>
                  <div className="mini-wall board only-dark" style={wallStyle(dark)}>
                    <ProfileHeader as="h4" title={wall.title} handle={wall.handle} bio={wall.bio} theme={dark} stats={[{ value: "3", label: "verified numbers" }]} />
                    <WallGrids tiles={wall.tiles} states={states} theme={dark} today={today} catalog={c.catalog} />
                  </div>
                </div>
              </article>

              <article className="cell cell-chat">
                <div className="cell-core">
                  <h3>A card that unfolds in any chat</h3>
                  <p>Post the link and it opens on today&apos;s numbers.</p>
                  <div className="chat" aria-label="A message thread sharing a wall">
                    <span className="bubble them">so how is the launch going?</span>
                    <span className="bubble me">flexwall.lol/@{wall.handle}</span>
                    <span className="unfurl">
                      <picture>
                        <source srcSet="/demo/card-dark.png?v=2" media="(prefers-color-scheme: dark)" />
                        <img src="/demo/card.png?v=2" alt="The share card of the example wall" width={1200} height={630} loading="lazy" />
                      </picture>
                      <span style={{ display: "block", padding: "8px 12px 10px" }}>
                        <strong>{wall.title} on Flexwall</strong>
                        flexwall.lol
                      </span>
                    </span>
                  </div>
                </div>
              </article>

              <article className="cell cell-verified">
                <div className="cell-core">
                  <h3>Verified at the source</h3>
                  <p>Revenue read with your own restricted Stripe key carries a mark nobody can type in.</p>
                  <div className="verified-tile">
                    <span className="value">$4,820</span>
                    <span className="source">
                      <SealCheckIcon size={18} weight="fill" />
                      Read from Stripe
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="section reveal" aria-labelledby="sources">
            <h2 id="sources" className="display">
              Plug in what you already use.
            </h2>
            <p className="section-lede">
              Keys are encrypted and read-only where the service allows it.
              {SOURCE_URL ? " Missing one? Connectors are open source." : ""}
            </p>
            <ul className="connector-list">
              {connectors.map((conn) => (
                <li key={conn.id}>
                  <h3>
                    <BrandMark id={conn.id} size={22} />
                    <Link href={integrationPath(conn.id)}>{conn.name}</Link>
                  </h3>
                  <p>{conn.description}</p>
                  <span className="tags">
                    {conn.verified ? <span className="badge quiet">Verified</span> : null}
                    {conn.tier === "pro" ? <span className="badge">Pro</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="more">
              <Link href="/integrations">Every integration, and what it measures</Link>
            </p>
          </section>

          <section className="closing reveal" aria-labelledby="closing">
            <h2 id="closing" className="display">
              Your numbers deserve a wall.
            </h2>
            <p className="section-lede">Free to start. Pro from $6 a month for verified revenue and history.</p>
            <div className="row">
              <Link href={signedIn ? "/edit" : "/login"} className="btn btn-signal">
                {signedIn ? "Edit my wall" : "Claim your wall"}
                <span className="btn-icon" aria-hidden="true">
                  <ArrowUpRightIcon size={16} weight="bold" />
                </span>
              </Link>
              <Link href="/pricing" className="link">
                See pricing
              </Link>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
