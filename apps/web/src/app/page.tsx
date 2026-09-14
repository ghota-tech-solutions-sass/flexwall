import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { MotionScope } from "@/components/motion/MotionScope";
import { JsonLd } from "@/components/seo/JsonLd";
import { TopBar, Footer } from "@/components/site/Chrome";
import { ClaimForm } from "@/components/site/ClaimForm";
import { catalog } from "@/plugins/registry";
import { sessionUserId } from "@/presentation/http";
import { integrationPath } from "@/presentation/seo/integrations";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { organizationLd, PLAN_PRICES_USD, SITE_DESCRIPTION, websiteLd } from "@/presentation/seo/structured-data";
import desk from "../../public/photos/desk.jpg";
import faceInes from "../../public/photos/face-ines.jpg";
import faceMaya from "../../public/photos/face-maya.jpg";
import faceTheo from "../../public/photos/face-theo.jpg";
import handChat from "../../public/photos/hand-chat.jpg";
import heroHand from "../../public/photos/hero-hand.jpg";
import laptopCafe from "../../public/photos/laptop-cafe.jpg";
import nightstand from "../../public/photos/nightstand.jpg";

export const metadata: Metadata = pageMetadata({ title: "Flexwall: your numbers, live, on one page", absoluteTitle: true, description: SITE_DESCRIPTION, path: "/" });

export const dynamic = "force-dynamic";

/** Photographs are staged: the screens in them are real Flexwall renders of the sample wall. */
const MOMENTS: { time: string; title: string; body: string; photo: StaticImageData; alt: string; tall?: boolean }[] = [
  {
    time: "7:00",
    title: "On your lock screen before coffee.",
    body: "One Shortcuts automation sets a fresh wallpaper every morning, drawn from last night's numbers. No app to install.",
    photo: nightstand,
    alt: "An iPhone on a bedside table at dawn, its lock screen showing MRR, a commit streak and a contributions graph",
  },
  {
    time: "13:00",
    title: "A page that keeps itself up to date.",
    body: "flexwall.lol/@you redraws from Stripe, GitHub and your own API. Set it up once and stop pasting screenshots.",
    photo: laptopCafe,
    alt: "A laptop on a café table showing a Flexwall page with revenue, customers and a streak",
  },
  {
    time: "21:00",
    title: "A card that opens in every chat.",
    body: "Send the link anywhere. It unfolds on today's numbers, not the ones from the day you set it up.",
    photo: handChat,
    alt: "Hands holding a phone with a message thread where a Flexwall link unfolds into a card",
    tall: true,
  },
];

/** Invented people, labelled as examples on the page: The Wall lists the real ones. */
const EXAMPLES: { name: string; who: string; figure: string; what: string; delta: string; photo: StaticImageData }[] = [
  { name: "Maya Levin", who: "@maya, iOS apps", figure: "$12.4k", what: "MRR, read from Stripe", delta: "+18% this month", photo: faceMaya },
  { name: "Théo Lambert", who: "@theo, open source", figure: "8,912", what: "GitHub stars", delta: "412-day streak", photo: faceTheo },
  { name: "Inès Garnier", who: "@ines, newsletter", figure: "21,380", what: "subscribers", delta: "+640 this week", photo: faceInes },
];

export default async function Home() {
  const signedIn = Boolean(await sessionUserId());
  const connectors = catalog.connectors();

  return (
    <>
      <JsonLd data={[organizationLd(siteOrigin()), websiteLd(siteOrigin())]} />
      <div className="page">
        <TopBar signedIn={signedIn} />
      </div>

      <main id="main">
        <div className="page">
          <section className="hero" aria-labelledby="title">
            <h1 id="title" className="display">
              Flex your real numbers.
            </h1>
            <div className="hero-aside">
              <p>Stripe revenue, GitHub streaks and any API, live at flexwall.lol/@you and on your lock screen.</p>
              <ClaimForm />
            </div>
          </section>

          <figure className="photo hero-photo">
            <Image src={heroHand} alt="A hand holding an iPhone whose lock screen shows live Flexwall widgets" placeholder="blur" priority sizes="(max-width: 1320px) 100vw, 1320px" />
          </figure>

          <nav className="sources" aria-label="Sources">
            <span>Reads from</span>
            {connectors
              .filter((conn) => hasMark(conn.id))
              .map((conn) => (
                <Link key={conn.id} href={integrationPath(conn.id)} aria-label={conn.name} title={conn.name}>
                  <BrandMark id={conn.id} size={24} />
                </Link>
              ))}
          </nav>
        </div>

        <section className="chapter" aria-labelledby="day">
          <div className="page">
            <div className="chapter-head">
              <h2 id="day" className="display">
                A day with your numbers.
              </h2>
            </div>
            <div className="moments">
              {MOMENTS.map((m) => (
                <article key={m.time} className="moment">
                  <figure className={m.tall ? "photo tall" : "photo"}>
                    <Image src={m.photo} alt={m.alt} placeholder="blur" sizes="(max-width: 860px) 100vw, 60vw" />
                  </figure>
                  <div>
                    <time className="figure">{m.time}</time>
                    <h3>{m.title}</h3>
                    <p>{m.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="chapter" aria-labelledby="verified">
          <MotionScope className="page">
            <div className="proof">
              <div>
                <span className="label">MRR</span>
                <b className="figure" data-count>
                  $4,820
                </b>
                <span className="seal">
                  <SealCheckIcon size={18} weight="fill" />
                  Read from Stripe
                </span>
              </div>
              <div>
                <h2 id="verified" className="display">
                  Anyone can type a number.
                </h2>
                <p>
                  A figure read from your own Stripe, Lemon Squeezy or Polar key carries a mark nobody can type in. Keys are encrypted, read-only where the service allows it, and never
                  shown again.
                </p>
              </div>
            </div>
          </MotionScope>
        </section>

        <section className="chapter" aria-labelledby="examples">
          <div className="page">
            <div className="chapter-head">
              <h2 id="examples" className="display">
                One wall, whatever you build.
              </h2>
              <Link href="/explore" className="text-link">
                See the real walls
                <ArrowUpRightIcon size={16} weight="bold" />
              </Link>
            </div>
            <ul className="examples">
              {EXAMPLES.map((e) => (
                <li key={e.name}>
                  <figure className="photo">
                    <Image src={e.photo} alt="" placeholder="blur" sizes="(max-width: 860px) 100vw, 33vw" />
                    <span className="tag">Example</span>
                  </figure>
                  <strong>{e.name}</strong>
                  <span className="who">{e.who}</span>
                  <b className="figure">{e.figure}</b>
                  <span className="what">
                    {e.what}, <span className="delta">{e.delta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="chapter" aria-labelledby="sources">
          <div className="page">
            <div className="chapter-head">
              <h2 id="sources" className="display">
                Plug in what you already use.
              </h2>
              <Link href="/integrations" className="text-link">
                Every integration
                <ArrowUpRightIcon size={16} weight="bold" />
              </Link>
            </div>
            <ul className="source-index">
              {connectors.map((conn) => (
                <li key={conn.id}>
                  {hasMark(conn.id) ? <BrandMark id={conn.id} size={22} /> : <span />}
                  <Link href={integrationPath(conn.id)}>{conn.name}</Link>
                  {conn.tier === "pro" ? <span className="badge">Pro</span> : <span />}
                  <p>{conn.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="chapter" aria-labelledby="closing">
          <div className="page closing">
            <figure className="photo">
              <Image src={desk} alt="" placeholder="blur" sizes="(max-width: 860px) 100vw, 50vw" />
            </figure>
            <div>
              <h2 id="closing" className="display">
                Your numbers deserve a wall.
              </h2>
              <p>Claim your handle in a minute. Free to start, no card needed.</p>
              {signedIn ? (
                <Link href="/edit" className="btn btn-signal">
                  Edit my wall
                </Link>
              ) : (
                <ClaimForm />
              )}
              <p className="price">
                Pro from ${PLAN_PRICES_USD.monthly} a month, taxes included. <Link href="/pricing">See pricing</Link>
              </p>
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
