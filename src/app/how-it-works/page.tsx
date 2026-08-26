import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { dynamicFloor, FLOOR_TIERS, formatUSD } from "@/lib/board";
import { listEntriesSafe, totalOnDisplay } from "@/lib/board-server";
import { pageMetadata } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "How it works",
  description: "Pick a spot, pay for it, defend it. Someone can always outbid you.",
  path: "/how-it-works",
});

const steps: [string, string, string][] = [
  ["01", "Pick a spot", "Choose how much you're willing to pay. Any name works: an X handle, your real name, a company, an alias."],
  ["02", "Get ranked", "Your name takes the position your money deserves. Ties go to whoever arrived first."],
  ["03", "Defend it", "Someone can pay more and take it from you. Pay again to take it back. That's the whole game."],
];

export default async function HowItWorksPage() {
  const entries = await listEntriesSafe();
  const floor = dynamicFloor(entries.length);
  const total = totalOnDisplay(entries);
  const dynamicRules = [
    `Minimum entry right now: ${formatUSD(floor)}. The floor rises as the wall fills.`,
    "Every name, amount and rank is public and permanent. There is no undo.",
    "No refunds. You're buying a spot on a leaderboard. You knew that.",
    "The wall shows what people paid, not what they're worth.",
    "Same name, same spot: paying again adds to your total. Top-ups have no minimum.",
    "Illegal or abusive display names are removed without refund.",
  ];

  return (
    <>
      <SiteNav total={total} variant="link" />
      <div className="page">
        <section className="hero" style={{ paddingBottom: 8 }}>
          <p className="eyebrow">how it works</p>
          <h1 className="h1" style={{ fontSize: "clamp(28px,4.5vw,44px)" }}>
            Pay. Rank. <em>Get outbid.</em>
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
            Early names lock in the low price. Everyone after pays the new floor.
          </p>
          <div className="list" style={{ marginTop: 18 }}>
            {[
              ["now", dynamicFloor(entries.length), entries.length],
              ...FLOOR_TIERS.map((t) => [
                t.at + "+ entries",
                t.floor,
                Math.max(0, t.at - entries.length),
              ]),
            ].map(([label, f, remaining], i) => (
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
