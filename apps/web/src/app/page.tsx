import type { Metadata } from "next";
import { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { asType, currencySymbol, formatNumber, formatPercent, seriesChange } from "@flexwall/sdk";
import { sparkPoints } from "@flexwall/sdk/ui";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { JsonLd } from "@/components/seo/JsonLd";
import { TopBar, Footer } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { Highlights } from "@/components/site/Highlights";
import { MotionScope } from "@/components/motion/MotionScope";
import { Tilt } from "@/components/motion/Tilt";
import { ProfileHeader } from "@/components/wall/ProfileHeader";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { DEVICES } from "@/domain/layout";
import { todayIn } from "@/domain/time";
import { PAID_TILE_LIMIT } from "@/domain/user";
import { demoWall, sampleStates } from "@/rendering/samples";
import { sessionUserId } from "@/presentation/http";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { integrationPath } from "@/presentation/seo/integrations";
import { organizationLd, SITE_DESCRIPTION, websiteLd } from "@/presentation/seo/structured-data";
import { SOURCE_URL } from "@/site";

export const metadata: Metadata = pageMetadata({ title: "Flexwall: your numbers, live, on one page", absoluteTitle: true, description: SITE_DESCRIPTION, path: "/" });

export const dynamic = "force-dynamic";

const PHONE = DEVICES["iphone-17-pro"];

/**
 * A demo image in both color schemes, resized and re-encoded (AVIF, WebP) by
 * the image optimizer. The dark variant is picked by the browser, not by CSS,
 * so only one of the two is ever downloaded.
 */
function SchemeImage({ name, alt, width, height, sizes, priority = false }: { name: string; alt: string; width: number; height: number; sizes: string; priority?: boolean }) {
  const common = { alt, width, height, sizes, ...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : { loading: "lazy" as const }) };
  const { props: dark } = getImageProps({ ...common, src: `/demo/${name}-dark.png` });
  const { props: light } = getImageProps({ ...common, src: `/demo/${name}.png` });
  return (
    <picture>
      <source srcSet={dark.srcSet} sizes={sizes} media="(prefers-color-scheme: dark)" />
      <img {...light} alt={alt} />
    </picture>
  );
}

/** The phone screen, with the clock the lock screen image leaves room for. */
function LockScreen({ date, priority = false }: { date: string; priority?: boolean }) {
  return (
    <div className="device" role="img" aria-label="An iPhone lock screen showing live Flexwall widgets">
      <div className="device-screen">
        <span className="device-island" />
        <SchemeImage name="lockscreen" alt="" width={PHONE.w} height={PHONE.h} sizes="(max-width: 460px) 74vw, 340px" priority={priority} />
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
  );
}

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
  const themeCount = c.catalog.themes().length;
  const revenueState = states.revenue;
  const revenue = revenueState?.status === "ready" ? asType(revenueState.inputs.series?.value, "series") : null;
  const trend = revenue ? sparkPoints(revenue.points.map((p) => p.v)) : "";
  const revenueNow = revenue ? currencySymbol(revenue.currency) + formatNumber(revenue.points.at(-1)?.v ?? 0) : null;
  const revenueChange = revenue ? seriesChange(revenue) : null;
  const date = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const claimHref = signedIn ? "/edit" : "/login";

  return (
    <>
      <JsonLd data={[organizationLd(siteOrigin()), websiteLd(siteOrigin())]} />
      <div className="page">
        <TopBar signedIn={signedIn} />
      </div>

      <main id="main">
        <section className="hero page">
          <p className="kicker">Flexwall</p>
          <h1 className="display">Flex your real numbers.</h1>
          <p className="hero-lede">Stripe revenue, GitHub streaks and any API, live on flexwall.lol/@you and on your lock screen.</p>
          <ClaimForm />

          <MotionScope className="stage">
            <div className="float-card float-chip glass" aria-hidden="true">
              <SealCheckIcon size={20} weight="fill" />
              Read from Stripe
            </div>
            <Tilt>
              <LockScreen date={date} priority />
            </Tilt>
            <div className="float-card float-mrr glass" aria-hidden="true">
              <span className="label">Revenue, 30 days</span>
              <b data-count>{revenueNow}</b>
              {revenueChange !== null ? <span className="delta">{formatPercent(revenueChange, true)}</span> : null}
              {trend ? (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" data-draw>
                  <polyline points={trend} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" style={{ color: "var(--accent)" }} />
                </svg>
              ) : null}
            </div>
            <div className="price-pill glass">
              <span>
                <strong>Free to start.</strong> Pro from $6 a month, taxes included.
              </span>
              <Link href="/pricing" className="btn btn-signal btn-small">
                See pricing
              </Link>
            </div>
          </MotionScope>

          <nav className="logos" aria-label="Sources">
            {connectors
              .filter((conn) => hasMark(conn.id))
              .map((conn) => (
                <Link key={conn.id} href={integrationPath(conn.id)} aria-label={conn.name} title={conn.name}>
                  <BrandMark id={conn.id} size={28} />
                </Link>
              ))}
          </nav>
        </section>

        <section className="band band-alt" aria-labelledby="highlights">
          <div className="page">
            <div className="band-head">
              <h2 id="highlights" className="display">
                Get the highlights.
              </h2>
              <Link href="/explore" className="text-link">
                See live walls
                <ArrowUpRightIcon size={16} weight="bold" />
              </Link>
            </div>
          </div>
          <Highlights label="Flexwall highlights">
            <article className="hl hl-page">
              <h3>Your numbers, redrawn from the source.</h3>
              <div className="mini-wall board only-light" style={wallStyle(light)}>
                <ProfileHeader as="h4" title={wall.title} handle={wall.handle} bio={wall.bio} theme={light} stats={[{ value: "3", label: "verified numbers" }]} />
                <WallGrids tiles={wall.tiles} states={states} theme={light} today={today} catalog={c.catalog} />
              </div>
              <div className="mini-wall board only-dark" style={wallStyle(dark)}>
                <ProfileHeader as="h4" title={wall.title} handle={wall.handle} bio={wall.bio} theme={dark} stats={[{ value: "3", label: "verified numbers" }]} />
                <WallGrids tiles={wall.tiles} states={states} theme={dark} today={today} catalog={c.catalog} />
              </div>
            </article>

            <article className="hl hl-phone">
              <h3>On your lock screen, every morning.</h3>
              <p>One Shortcuts automation sets a fresh wallpaper at 7:00. No app to install.</p>
              <LockScreen date={date} />
            </article>

            <article className="hl hl-chat">
              <h3>A card that unfolds in every chat.</h3>
              <p>Post your link anywhere and it opens on today&apos;s numbers.</p>
              <div className="chat" aria-label="A message thread sharing a wall">
                <span className="bubble them">so how is the launch going?</span>
                <span className="bubble me">flexwall.lol/@{wall.handle}</span>
                <span className="unfurl">
                  <SchemeImage name="card" alt="The share card of the example wall" width={1200} height={630} sizes="(max-width: 600px) 80vw, 420px" />
                  <span style={{ display: "block", padding: "8px 12px 10px" }}>
                    <strong>{wall.title} on Flexwall</strong>
                    flexwall.lol
                  </span>
                </span>
              </div>
            </article>

            <article className="hl hl-verified">
              <h3>Read straight from your accounts.</h3>
              <p>A number that comes from your own Stripe, Lemon Squeezy or Polar key carries a mark nobody can type in.</p>
              <MotionScope className="verified-stage">
                <div className="verified-card glass">
                  <span className="label">MRR</span>
                  <span className="value" data-count>
                    $4,820
                  </span>
                  <span className="source">
                    <SealCheckIcon size={18} weight="fill" />
                    Read from Stripe
                  </span>
                </div>
              </MotionScope>
            </article>
          </Highlights>
        </section>

        <section className="band" aria-label="Flexwall in numbers">
          <MotionScope className="page figures">
            <div>
              <span>Up to</span>
              <b data-count>{`${PAID_TILE_LIMIT} tiles`}</b>
              <span>on a Pro wall</span>
            </div>
            <div>
              <span>Read from</span>
              <b data-count>{`${connectors.length} sources`}</b>
              <span>and your own API</span>
            </div>
            <div>
              <span>Choose from</span>
              <b data-count>{`${themeCount} themes`}</b>
              <span>for day and night</span>
            </div>
          </MotionScope>
        </section>

        <section className="band band-alt" aria-labelledby="sources">
          <div className="page">
            <div className="centered-head">
              <p className="kicker">Integrations</p>
              <h2 id="sources" className="display">
                Plug in what you already use.
              </h2>
              <p className="lede">
                Connect an account once and every tile can read from it. <strong>Keys are encrypted and read-only</strong> where the service allows it,
                and <strong>never shown again</strong>.{SOURCE_URL ? " Missing one? Connectors are open source." : ""}
              </p>
            </div>
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
              <Link href="/integrations" className="text-link">
                Every integration, and what it measures
                <ArrowUpRightIcon size={16} weight="bold" />
              </Link>
            </p>
          </div>
        </section>

        <section className="band closing" aria-labelledby="closing">
          <div className="page">
            <h2 id="closing" className="display">
              Your numbers deserve a wall.
            </h2>
            <p className="lede">Claim your handle in a minute. Free to start, no card needed.</p>
            <div className="row">
              <Link href={claimHref} className="btn btn-signal">
                {signedIn ? "Edit my wall" : "Claim your wall"}
                <span className="btn-icon" aria-hidden="true">
                  <ArrowUpRightIcon size={16} weight="bold" />
                </span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="page">
        <Footer />
      </div>
    </>
  );
}
