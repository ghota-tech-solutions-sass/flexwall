import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { dynamicFloor, FLOOR_TIERS, formatUSD } from "@/lib/board";
import { listEntriesSafe, totalOnDisplay } from "@/lib/board-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How it works",
  description: "The rules of the wall: pick a name, post the money, take your place, defend it.",
  alternates: { canonical: "/how-it-works" },
  openGraph: { url: "/how-it-works", title: "How it works · flexwall.lol", description: "Pick a name, post the money, take your place, defend it." },
};

const steps: [string, string, string][] = [
  ["01", "Pick a name", "An X handle, your real name, your company, or an alias. The first payment sets the display name. Later payments under the same name add to the same seat."],
  ["02", "Post the money", "Checkout runs on Stripe. The amount you post goes on public display next to your name. The current minimum is shown below. It rises as the wall fills."],
  ["03", "Take your place", "Your rank is your amount. Bigger amount, higher place. Ties go to whoever arrived first."],
  ["04", "Defend it", "Anyone can post more than you and take your spot. Top up to take it back, or let the record show the takeover."],
];

export default async function HowItWorksPage() {
  const entries = await listEntriesSafe();
  const floor = dynamicFloor(entries.length);
  const total = totalOnDisplay(entries);
  const dynamicRules = [
    `Minimum entry right now: ${formatUSD(floor)}. The floor rises as the wall fills.`,
    "Every amount is public and permanent. There is no undo.",
    "No refunds. Entries are final.",
    "The wall shows declared display amounts, not verified net worth.",
    "Same name, same seat: posting again adds to your total. Top-ups have no minimum.",
    "Illegal or abusive display names are removed without refund.",
  ];

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 8 }}>
          <p className="eyebrow">how it works</p>
          <h1 className="h1" style={{ fontSize: "clamp(34px,5vw,52px)" }}>
            Four moves. <em>One wall.</em>
          </h1>
        </section>

        <div className="list" style={{ marginTop: 30 }}>
          {steps.map(([n, t, d]) => (
            <div className="rowi" key={n}>
              <span className="rk mono">{n}</span>
              <div className="hcell">
                <span className="handle-md">{t}</span>
                <div className="pass-hint" style={{ whiteSpace: "normal" }}>{d}</div>
              </div>
              <span className="amt-md" />
            </div>
          ))}
        </div>

        <div className="why-block" style={{ marginTop: 48 }}>
          <p className="section-label">the rules</p>
          <h3 style={{ fontSize: "clamp(24px,3.5vw,34px)" }}>
            The floor rises <em className="gold">as the wall fills.</em>
          </h3>
          <p className="subline" style={{ marginTop: 8 }}>
            Early names lock in the low price. Later names pay full price.
          </p>
          <div className="list" style={{ marginTop: 18 }}>
            {[
              ["now", dynamicFloor(entries.length), entries.length],
              ...FLOOR_TIERS.map((t) => [
                t.at + "+ entries",
                t.floor,
                Math.max(0, t.at - entries.length),
              ]),
            ].map(([label, f, remaining], i, arr) => (
              <div className="rowi" key={i}>
                <span className="rk mono">{String(i + 1).padStart(2, "0")}</span>
                <div className="hcell">
                  <span className="handle-md">
                    {i === 0 ? "current floor" : "from " + label}
                    {remaining !== undefined && i > 0 && Number(remaining) === 0 ? (
                      <span className="fstar"> ← now</span>
                    ) : null}
                  </span>
                </div>
                <div className="acell">
                  <span className="amt-md gold">{formatUSD(Number(f))}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="list" style={{ marginTop: 20, borderTop: "1px solid var(--line)" }}>
            {dynamicRules.map((r, i) => (
              <div className="rowi" key={i}>
                <span className="rk mono">§{i + 1}</span>
                <div className="hcell">
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>{r}</span>
                </div>
                <span className="amt-md" />
              </div>
            ))}
          </div>
        </div>

        <SiteFooter />
      </div>
    </>
  );
}
