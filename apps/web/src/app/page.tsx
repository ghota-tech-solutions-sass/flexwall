import type { Metadata } from "next";
import Image, { getImageProps, type StaticImageData } from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  EyeSlashIcon,
  KeyIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import { asType, currencySymbol, formatNumber } from "@flexwall/sdk";
import { stripeConnector } from "@flexwall/plugin-stripe";
import { sparkPoints } from "@flexwall/sdk/ui";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { container } from "@/composition";
import { visibleConnectors } from "@/presentation/connections";
import { MotionScope } from "@/components/motion/MotionScope";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer, TopBar } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { todayIn } from "@/domain/time";
import { PLAN_PRICES_USD } from "@/domain/pricing";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { catalog } from "@/plugins/registry";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";
import { integrationPath } from "@/presentation/seo/integrations";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import {
  organizationLd,
  SITE_DESCRIPTION,
  websiteLd,
} from "@/presentation/seo/structured-data";
import { demoWall, sampleStates } from "@/rendering/samples";
import handChat from "../../public/photos/hand-chat.jpg";
import laptopCafe from "../../public/photos/laptop-cafe.jpg";
import nightstand from "../../public/photos/nightstand.jpg";

export const metadata: Metadata = pageMetadata({
  title: "Flexwall: your numbers, live, on one page",
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: ROUTES.home,
});

export const dynamic = "force-dynamic";


/** Photographs are staged; the screens in them are real Flexwall renders of the sample wall. */
const MOMENTS: {
  time: string;
  title: string;
  body: string;
  photo: StaticImageData;
  alt: string;
}[] = [
  {
    time: "7:00",
    title: "On your lock screen",
    body: "A Shortcuts automation sets a fresh wallpaper every morning. No app to install.",
    photo: nightstand,
    alt: "An iPhone on a bedside table at dawn, its lock screen showing MRR, a commit streak and a contributions graph",
  },
  {
    time: "13:00",
    title: "On your public page",
    body: "flexwall.lol/@you redraws itself from your accounts. No more screenshots.",
    photo: laptopCafe,
    alt: "A laptop on a café table showing a Flexwall page with revenue, customers and a streak",
  },
  {
    time: "21:00",
    title: "In every chat",
    body: "Your link unfolds into a card with today's numbers, wherever you post it.",
    photo: handChat,
    alt: "Hands holding a phone with a message thread where a Flexwall link unfolds into a card",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is Flexwall free?",
    a: `Yes. A public wall with up to ${FREE_TILE_LIMIT} tiles, a share card and a lock screen with a small flexwall.lol mark costs nothing. Pro is $${PLAN_PRICES_USD.monthly} a month or $${PLAN_PRICES_USD.yearly} a year, taxes included, and adds verified revenue, your own API, history charts, every theme and a clean lock screen.`,
  },
  {
    q: "How are revenue numbers verified?",
    a: "Stripe, Lemon Squeezy and Polar figures are read with a key from your own account, so they carry a Verified mark. A number typed by hand never gets one.",
  },
  {
    q: "Is my Stripe key safe?",
    a: "Use a restricted, read-only key. It is encrypted before it is stored, it is never shown again, and you can revoke it from Stripe at any time.",
  },
  {
    q: "How does the lock screen update?",
    a: "Your wall has a private wallpaper link. An Apple Shortcuts automation downloads it every morning and sets it as your lock screen. Private tiles can go there too.",
  },
  {
    q: "Can I keep some numbers private?",
    a: "Yes. Any tile can be private: it stays off your public page and share card, and can still show on your own lock screen.",
  },
  {
    q: "Can I cancel Pro?",
    a: "Any time, from Settings. Pro stays on until the end of the period you paid for.",
  },
];

/** A demo image in both color schemes; the browser downloads only the one it shows. */
function SchemeImage({
  name,
  alt,
  width,
  height,
  sizes,
  priority = false,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  priority?: boolean;
}) {
  const common = {
    alt,
    width,
    height,
    sizes,
    ...(priority
      ? { loading: "eager" as const, fetchPriority: "high" as const }
      : { loading: "lazy" as const }),
  };
  const { props: dark } = getImageProps({
    ...common,
    src: `/demo/${name}-dark.png`,
  });
  const { props: light } = getImageProps({
    ...common,
    src: `/demo/${name}.png`,
  });
  return (
    <picture>
      <source
        srcSet={dark.srcSet}
        sizes={sizes}
        media="(prefers-color-scheme: dark)"
      />
      <img {...light} alt={alt} />
    </picture>
  );
}

export default async function Home() {
  const now = Date.now();
  const today = todayIn("UTC", now);
  const wall = demoWall(today);
  const light = catalog.theme(wall.theme)!;
  const dark = catalog.theme("midnight") ?? light;
  const states = sampleStates(wall.tiles, catalog);
  const signedIn = Boolean(await sessionUserId());
  const connectors = visibleConnectors(catalog.connectors(), await container().publicConnectors.execute());
  const featuredConnectors = connectors.filter((c) => ["stripe", "github", "polar", "lemon-squeezy", "plausible", "npm"].includes(c.id));
  const heroTiles = ["mrr", "streak", "revenue", "customers"].map((id, i) => ({ ...wall.tiles.find((tile) => tile.id === id)!, layout: { x: (i % 2) * 2, y: Math.floor(i / 2), w: 2, h: 1 } }));
  const revenueState = states.revenue;
  const revenue =
    revenueState?.status === "ready"
      ? asType(revenueState.inputs.series?.value, "series")
      : null;
  const trend = revenue ? sparkPoints(revenue.points.map((p) => p.v)) : "";
  const mrrState = states.mrr;
  const mrr =
    mrrState?.status === "ready"
      ? asType(mrrState.inputs.value?.value, "number")
      : null;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <>
      <JsonLd
        data={[organizationLd(siteOrigin()), websiteLd(siteOrigin()), faqLd]}
      />
      <div className="page">
        <TopBar signedIn={signedIn} />
      </div>

      <main id="main">
        <section className="hero hero-conversion page" aria-labelledby="title">
          <div className="hero-copy">
            <Link href={integrationPath(stripeConnector.id)} className="pill-link">
              <SealCheckIcon size={18} weight="fill" /> Revenue, straight from the source
            </Link>
            <h1 id="title" className="display">Your work.<br />The numbers to prove it.</h1>
            <p className="hero-lede">Turn your revenue and progress into one live page. Share your story with numbers from Stripe, GitHub and the tools you already use.</p>
            {signedIn ? <Link href={ROUTES.edit} className="btn btn-signal">Edit my wall</Link> : <ClaimForm />}
            <div className="hero-demo-link"><Link href={ROUTES.demo}>Try the interactive demo <ArrowRightIcon size={16} /></Link><span>No sign-up needed</span></div>
            <ul className="trust">
              <li><CheckIcon size={16} weight="bold" /> Free to start</li>
              <li><CheckIcon size={16} weight="bold" /> No card needed</li>
              <li><EyeSlashIcon size={16} /> You choose what is public</li>
            </ul>
          </div>
          <div className="hero-preview">
            <div className="preview-caption"><span>Ada’s launch journal</span><span className="badge">Sample data</span></div>
            <div className="preview-board only-light" style={wallStyle(light)}>
              <WallGrids animate={false} tiles={heroTiles} states={states} theme={light} today={today} catalog={catalog} />
            </div>
            <div className="preview-board only-dark" style={wallStyle(dark)}>
              <WallGrids animate={false} tiles={heroTiles} states={states} theme={dark} today={today} catalog={catalog} />
            </div>
            <p>One page. A share card. Your daily lock screen.</p>
          </div>
        </section>

        <nav className="sources page" aria-label="Sources">
          <span>Reads from the tools you already use</span>
          {featuredConnectors
            .filter((conn) => hasMark(conn.id))
            .map((conn) => (
              <Link key={conn.id} href={integrationPath(conn.id)}>
                <BrandMark id={conn.id} size={20} />
                {conn.name}
              </Link>
            ))}
        </nav>

        <section className="block page tinted" aria-labelledby="how">
          <div className="block-head">
            <span className="eyebrow">How it works</span>
            <h2 id="how" className="display">
              Live in three steps.
            </h2>
            <p>No code, no screenshots, no app to install.</p>
          </div>
          <ol className="steps">
            <li>
              <span className="n">Step 1</span>
              <h3>Claim your handle</h3>
              <p>Pick the address people will remember.</p>
              <div className="step-ui" aria-hidden="true">
                <span className="fake-input">
                  <span>
                    flexwall.lol/@<b>{wall.handle}</b>
                  </span>
                  <i>Available</i>
                </span>
              </div>
            </li>
            <li>
              <span className="n">Step 2</span>
              <h3>Connect your accounts</h3>
              <p>Paste a read-only key or a username. Tiles fill themselves.</p>
              <div className="step-ui" aria-hidden="true">
                <span className="conn">
                  <BrandMark id={stripeConnector.id} size={18} />
                  Stripe
                  <span className="on">Verified</span>
                </span>
                <span className="conn">
                  <BrandMark id="github" size={18} />
                  GitHub
                  <span className="on">Connected</span>
                </span>
                <span className="conn">
                  <BrandMark id="plausible" size={18} />
                  Plausible
                  <span>Connect</span>
                </span>
              </div>
            </li>
            <li>
              <span className="n">Step 3</span>
              <h3>Share it everywhere</h3>
              <p>
                Post the link, set the lock screen. It keeps itself current.
              </p>
              <div className="step-ui" aria-hidden="true">
                <SchemeImage
                  name="card"
                  alt=""
                  width={1200}
                  height={630}
                  sizes="340px"
                />
              </div>
            </li>
          </ol>
        </section>

        <section className="block page" aria-labelledby="everywhere">
          <div className="block-head">
            <span className="eyebrow">Everywhere</span>
            <h2 id="everywhere" className="display">
              The same numbers, all day.
            </h2>
            <p>
              One source of truth for your page, your phone and every link you
              share.
            </p>
          </div>
          <ul className="moments">
            {MOMENTS.map((m) => (
              <li key={m.time}>
                <figure>
                  <Image
                    src={m.photo}
                    alt={m.alt}
                    placeholder="blur"
                    sizes="(max-width: 900px) 100vw, 33vw"
                  />
                </figure>
                <time>{m.time}</time>
                <h3>{m.title}</h3>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="block page tinted" aria-labelledby="verified">
          <div className="verified">
            <div>
              <div className="block-head">
                <span className="eyebrow">Verified</span>
                <h2 id="verified" className="display">
                  A source behind every number.
                </h2>
                <p>
                  Verified figures come directly from your connected provider.
                  Personal API data and typed numbers are clearly distinguished.
                </p>
              </div>
              <ul className="points">
                <li>
                  <KeyIcon />
                  <strong>Read-only access</strong>
                  <span>
                    Restricted keys with the read permissions the connector needs.
                  </span>
                </li>
                <li>
                  <EyeSlashIcon />
                  <strong>Encrypted, never shown again</strong>
                  <span>
                    Keys are encrypted at rest and revocable from your provider.
                  </span>
                </li>
                <li>
                  <SealCheckIcon />
                  <strong>Know where each number comes from</strong>
                  <span>
                    Provider-verified, synchronized from your API, or entered manually.
                  </span>
                </li>
              </ul>
            </div>
            <MotionScope className="tile-demo">
              <div>
                <span className="label">
                  MRR
                  <span>Daily revenue, 30 days</span>
                </span>
                <b data-count>
                  {mrr
                    ? currencySymbol(mrr.currency ?? "usd") +
                      formatNumber(mrr.value)
                    : null}
                </b>
                {trend ? (
                  <svg
                    className="spark"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    data-draw
                  >
                    <polyline
                      points={trend}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : null}
                <span className="meta">
                  <span className="seal">
                    <SealCheckIcon size={16} weight="fill" />
                    Verified with Stripe
                  </span>
                  <span>Refreshed every 30 minutes</span>
                </span>
              </div>
            </MotionScope>
          </div>
        </section>

        <section className="block page" aria-labelledby="examples">
          <div className="cta-band">
            <span className="eyebrow">Make it yours</span>
            <h2 id="examples" className="display">See your next page before you sign up.</h2>
            <p>Change the theme, edit the title and choose the numbers to show. Our demo uses sample data, so you can explore without connecting an account.</p>
            <Link href={ROUTES.demo} className="btn btn-signal">Try the demo <ArrowRightIcon size={16} /></Link>
          </div>
        </section>

        <section className="block page tinted" aria-labelledby="sources">
          <div className="block-head">
            <span className="eyebrow">Integrations</span>
            <h2 id="sources" className="display">
              Plug in what you already use.
            </h2>
            <p>Connect an account once and every tile can read from it.</p>
          </div>
          <p><Link href={ROUTES.integrations}>Browse all integrations <ArrowRightIcon size={14} /></Link></p>
          <ul className="connector-list">
            {featuredConnectors.map((conn) => (
              <li key={conn.id}>
                <h3>
                  <BrandMark id={conn.id} size={20} />
                  <Link href={integrationPath(conn.id)}>{conn.name}</Link>
                </h3>
                <p>{conn.description}</p>
                <span className="tags">
                  {conn.verified ? (
                    <span className="badge quiet">Verified</span>
                  ) : null}
                  {conn.tier === "pro" ? (
                    <span className="badge">Pro</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="block page faq" aria-labelledby="faq">
          <div className="block-head">
            <span className="eyebrow">FAQ</span>
            <h2 id="faq" className="display">
              Questions, answered.
            </h2>
            <p>
              Anything else? <Link href={ROUTES.legal}>Contact us</Link>.
            </p>
          </div>
          <div>
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="block page" aria-labelledby="closing">
          <div className="cta-band">
            <h2 id="closing" className="display">
              Your numbers deserve a wall.
            </h2>
            <p>
              Free to start. Pro from ${PLAN_PRICES_USD.monthly} a month, taxes
              included. <Link href={ROUTES.pricing}>See pricing</Link>
            </p>
            {signedIn ? (
              <Link href={ROUTES.edit} className="btn btn-signal">
                Edit my wall
              </Link>
            ) : (
              <ClaimForm />
            )}
          </div>
        </section>
      </main>

      <div className="page">
        <Footer />
      </div>
    </>
  );
}
