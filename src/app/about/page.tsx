import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { XLogo } from "@/components/OutLink";
import { listEntriesSafe, totalOnDisplay } from "@/lib/board-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description: "What flexwall.lol is, how the money moves, and what the wall is not.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: "About · flexwall.lol", description: "What flexwall.lol is, how the money moves, and what the wall is not." },
};

function LinkedInLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

const cards: [string, string[]][] = [
  [
    "What this is",
    [
      "A public wall that ranks money. You pick a name, you post an amount through Stripe, and the wall shows your name, your amount and your rank. That is the whole product: nothing to buy, nothing shipped, nothing unlocked.",
      "Anyone can post more than you and take your place. Your name and every payment stay in the register either way.",
    ],
  ],
  [
    "How the money moves",
    [
      "Payments run through Stripe hosted checkout. We never see or store your card. What you pay is what the wall displays, and payments are final: what you bought (a public, dated record) is delivered the second you pay.",
      "The entry minimum starts low and rises as the wall fills. Top-ups on an existing seat have no minimum.",
    ],
  ],
  [
    "What this is not",
    [
      "Not a wealth ranking: the wall shows what people chose to post, not what they are worth.",
      "Not an investment, a raffle or a donation with perks. No return, no prize, no product. If you expect anything back beyond a rank on a wall, do not enter.",
    ],
  ],
  [
    "Names and removals",
    [
      "Enter under an X handle, a real name, a company or an alias. The first payment sets the display name; the same name always adds to the same seat.",
      "Illegal, abusive or impersonating display names are removed without refund. That rule keeps the wall publishable, and it is the only edit we ever make.",
    ],
  ],
];

export default async function AboutPage() {
  const entries = await listEntriesSafe();
  const total = totalOnDisplay(entries);

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 10 }}>
          <p className="eyebrow">about</p>
          <h1 className="h1 serif" style={{ fontSize: "clamp(34px,5vw,52px)" }}>
            A wall that ranks <em className="green">money.</em>
          </h1>
          <p className="subline">
            Inspired by{" "}
            <a className="mail-link" href="https://outbid.lol" target="_blank" rel="noopener noreferrer nofollow">outbid.lol</a>{" "}
            and the pay-to-be-seen wave around it, stripped of everything except the part
            people actually came for: the rank.
          </p>
        </section>

        <div className="why-grid" style={{ marginTop: 18 }}>
          {cards.map(([title, paras]) => (
            <div className="why-card" key={title}>
              <h5>{title}</h5>
              {paras.map((t, i) => (
                <p style={{ marginTop: i === 0 ? 0 : 10 }} key={i}>{t}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="why-block" style={{ marginTop: 30 }}>
          <p className="section-label">Who runs this</p>
          <div className="operator-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="operator-avatar" src="/mickael.jpg" alt="Mickaël Villers" width={64} height={64} />
            <div>
              <p className="operator-name">Mickaël Villers</p>
              <p className="operator-sub">
                <a className="operator-co" href="https://ghotatechsolutions.com" target="_blank" rel="noopener noreferrer">Ghota Tech Solutions</a>
                {" "}· Lyon, France
              </p>
              <div className="operator-links">
                <a className="operator-x" href="https://x.com/MickaelV79228" target="_blank" rel="noopener noreferrer">
                  <XLogo size={13} /> @MickaelV79228
                </a>
                <a className="operator-x" href="https://www.linkedin.com/in/mickael-villers-1b1a6496/" target="_blank" rel="noopener noreferrer">
                  <LinkedInLogo size={13} /> LinkedIn
                </a>
              </div>
            </div>
          </div>
          <p className="subline" style={{ marginTop: 14 }}>
            Mickaël is a freelance DevOps and cloud engineer in Lyon, and a hopeless tech addict
            who ships small internet things faster than he names them: a cat battle game
            (<a className="mail-link" href="https://kittenclash.com" target="_blank" rel="noopener noreferrer">kittenclash.com</a>),
            a letter-writing app
            (<a className="mail-link" href="https://lettrio.app" target="_blank" rel="noopener noreferrer">lettrio.app</a>),
            an AI photo roaster
            (<a className="mail-link" href="https://roastmypic.ai" target="_blank" rel="noopener noreferrer">roastmypic.ai</a>),
            a box of free everyday tools
            (<a className="mail-link" href="https://outilis.fr" target="_blank" rel="noopener noreferrer">outilis.fr</a>),
            and now a wall that ranks money.
          </p>
          <p className="subline" style={{ marginTop: 12 }}>
            Most of flexwall was built in a weekend, with AI pair-programming doing a lot of the
            typing and Stripe, Cloud Run and Firestore doing the heavy lifting. The whole thing
            is open source at{" "}
            <a className="mail-link" href="https://github.com/ghota-tech-solutions-sass/flexwall" target="_blank" rel="noopener noreferrer">github.com/ghota-tech-solutions-sass/flexwall</a>.
            He builds in public on X; the follower graph is part of the experiment.
          </p>
          <p className="subline" style={{ marginTop: 12 }}>
            Questions, press, or a name that should not be on the wall:{" "}
            <a className="mail-link" href="mailto:villers@ghotatechsolutions.com">villers@ghotatechsolutions.com</a>.
          </p>
        </div>

        <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
          <Link className="btn-take" href="/?enter=1">Enter the list</Link>
          <Link className="btn-ghost" href="/how-it-works">Read the rules</Link>
        </div>

        <SiteFooter />
      </div>
    </>
  );
}
