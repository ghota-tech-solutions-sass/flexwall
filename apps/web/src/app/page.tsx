import type { Metadata } from "next";
import Image, { getImageProps, type StaticImageData } from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  EyeSlashIcon,
  KeyIcon,
  LockKeyIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import { asType, currencySymbol, formatNumber } from "@flexwall/sdk";
import { stripeConnector } from "@flexwall/plugin-stripe";
import { sparkPoints } from "@flexwall/sdk/ui";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { MotionScope } from "@/components/motion/MotionScope";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer, TopBar } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { ProfileHeader } from "@/components/wall/ProfileHeader";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { DEFAULT_DEVICE, DEVICES } from "@/domain/layout";
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
import faceInes from "../../public/photos/face-ines.jpg";
import faceMaya from "../../public/photos/face-maya.jpg";
import faceTheo from "../../public/photos/face-theo.jpg";
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

const PHONE = DEVICES[DEFAULT_DEVICE];

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

/** Invented people, labelled as examples on the page: The Wall lists the real ones. */
const EXAMPLES: {
  name: string;
  handle: string;
  figure: string;
  what: string;
  delta: string;
  photo: StaticImageData;
}[] = [
  {
    name: "Maya Levin",
    handle: "maya",
    figure: "$12.4k",
    what: "MRR, verified with Stripe",
    delta: "+18% this month",
    photo: faceMaya,
  },
  {
    name: "Théo Lambert",
    handle: "theo",
    figure: "8,912",
    what: "GitHub stars",
    delta: "412-day streak",
    photo: faceTheo,
  },
  {
    name: "Inès Garnier",
    handle: "ines",
    figure: "21,380",
    what: "newsletter subscribers",
    delta: "+640 this week",
    photo: faceInes,
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

/** The phone screen, with the clock the lock screen image leaves room for. */
function LockScreen({ date }: { date: string }) {
  return (
    <div
      className="device"
      role="img"
      aria-label="An iPhone lock screen showing the same numbers as widgets"
    >
      <div className="device-screen">
        <span className="device-island" />
        <SchemeImage
          name="lockscreen"
          alt=""
          width={PHONE.w}
          height={PHONE.h}
          sizes="270px"
          priority
        />
        <div className="device-clock only-light">
          <div>{date}</div>
          <div>9:41</div>
        </div>
        <div
          className="device-clock only-dark"
          style={{ ["--clock" as string]: "#f5f5f7" }}
        >
          <div>{date}</div>
          <div>9:41</div>
        </div>
      </div>
    </div>
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
  const connectors = catalog.connectors();
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
  const date = new Date(now).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
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
        <section className="hero page" aria-labelledby="title">
          <Link href={integrationPath(stripeConnector.id)} className="pill-link">
            <SealCheckIcon size={18} weight="fill" />
            Revenue verified straight from Stripe
            <ArrowRightIcon size={14} />
          </Link>
          <h1 id="title" className="display">
            Flex your real numbers.
          </h1>
          <p className="hero-lede">
            Stripe revenue, GitHub streaks and any API, live on one public page
            and on your lock screen. Set it up once, it stays up to date.
          </p>
          <ClaimForm />
          <ul className="trust">
            <li>
              <CheckIcon size={16} weight="bold" />
              Free to start
            </li>
            <li>
              <CheckIcon size={16} weight="bold" />
              No card needed
            </li>
            <li>
              <CheckIcon size={16} weight="bold" />
              Read-only keys
            </li>
          </ul>

          <div className="showcase">
            <div className="browser">
              <div className="browser-bar" aria-hidden="true">
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="url">
                  <LockKeyIcon size={12} />
                  flexwall.lol/@{wall.handle}
                </span>
                <span />
              </div>
              <div
                className="browser-body only-light"
                style={{ ["--wall-fade" as string]: light.page }}
              >
                <div className="mini-wall board" style={wallStyle(light)}>
                  <ProfileHeader
                    as="h2"
                    title={wall.title}
                    handle={wall.handle}
                    bio={wall.bio}
                    theme={light}
                    stats={[{ value: "3", label: "verified numbers" }]}
                  />
                  <WallGrids
                    tiles={wall.tiles}
                    states={states}
                    theme={light}
                    today={today}
                    catalog={catalog}
                  />
                </div>
              </div>
              <div
                className="browser-body only-dark"
                style={{ ["--wall-fade" as string]: dark.page }}
              >
                <div className="mini-wall board" style={wallStyle(dark)}>
                  <ProfileHeader
                    as="h2"
                    title={wall.title}
                    handle={wall.handle}
                    bio={wall.bio}
                    theme={dark}
                    stats={[{ value: "3", label: "verified numbers" }]}
                  />
                  <WallGrids
                    tiles={wall.tiles}
                    states={states}
                    theme={dark}
                    today={today}
                    catalog={catalog}
                  />
                </div>
              </div>
            </div>
            <LockScreen date={date} />
          </div>
        </section>

        <nav className="sources page" aria-label="Sources">
          <span>Reads from the tools you already use</span>
          {connectors
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
                  Numbers nobody can type in.
                </h2>
                <p>
                  Screenshots can be edited. A figure read from your own account
                  can&apos;t.
                </p>
              </div>
              <ul className="points">
                <li>
                  <KeyIcon />
                  <strong>Read-only access</strong>
                  <span>
                    Restricted keys that can read revenue and nothing else.
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
                  <strong>A mark on every verified tile</strong>
                  <span>
                    Visitors see which numbers come straight from the source.
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
          <div className="block-head">
            <span className="eyebrow">For every kind of builder</span>
            <h2 id="examples" className="display">
              One wall, whatever you build.
            </h2>
            <p>
              Apps, open source, newsletters, videos.{" "}
              <Link href={ROUTES.explore}>See the real walls on The Wall</Link>.
            </p>
          </div>
          <ul className="examples">
            {EXAMPLES.map((e) => (
              <li key={e.handle}>
                <span className="who">
                  <Image src={e.photo} alt="" sizes="44px" />
                  <strong>{e.name}</strong>
                  <span>@{e.handle}</span>
                  <span className="badge">Example</span>
                </span>
                <b>{e.figure}</b>
                <span className="what">
                  {e.what} <span className="delta">{e.delta}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="block page tinted" aria-labelledby="sources">
          <div className="block-head">
            <span className="eyebrow">Integrations</span>
            <h2 id="sources" className="display">
              Plug in what you already use.
            </h2>
            <p>Connect an account once and every tile can read from it.</p>
          </div>
          <ul className="connector-list">
            {connectors.map((conn) => (
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
