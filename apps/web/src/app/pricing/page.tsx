import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopBar } from "@/components/site/Chrome";
import { CheckoutConsentScope } from "@/components/site/CheckoutConsent";
import { UpgradeButton } from "@/components/site/UpgradeButton";
import { FREE_TILE_LIMIT, PAID_TILE_LIMIT } from "@/domain/user";
import { container } from "@/composition";
import { PAID_ACCOUNT_PRICE_USD, PLAN_PRICES_USD, sellablePlan } from "@/domain/pricing";
import { REFERRAL_DISCOUNT_PERCENT } from "@/domain/referral";
import { sessionUserId } from "@/presentation/http";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { softwareApplicationLd } from "@/presentation/seo/structured-data";
import { ROUTES } from "@/presentation/routes";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `Every public wall is free. Pro is $${PLAN_PRICES_USD.monthly} a month or $${PLAN_PRICES_USD.yearly} a year for verified revenue, history and a clean lock screen. Connected bank and brokerage accounts are $${PAID_ACCOUNT_PRICE_USD} a month each.`,
  path: ROUTES.pricing,
});

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const selectedPlan = sellablePlan((await searchParams).plan);
  const userId = await sessionUserId();
  const signedIn = Boolean(userId);
  const invitedBy = userId ? ((await container().getReferralProgram.execute({ userId }))?.invitedBy ?? null) : null;
  return (
    <div className="page">
      <JsonLd data={softwareApplicationLd(siteOrigin())} />
      <TopBar signedIn={signedIn} />
      <main id="main">
        <div className="page-head dotted">
          <h1 className="display">Start free. Share more with Pro.</h1>
          <p>Build your page first. Upgrade for verified revenue, history and a wall that looks entirely yours. You choose what to publish.</p>
          <p className="hint">Prices in US dollars, taxes included. Cancel any time from Settings.</p>
          {selectedPlan ? <p className="hint" role="status">You selected Pro {selectedPlan}. Review the plan and confirm below when you are ready.</p> : null}
          {invitedBy ? (
            <p className="hint">
              Invited by @{invitedBy}: {REFERRAL_DISCOUNT_PERCENT}% off your first payment, applied at checkout.
            </p>
          ) : null}
        </div>
        <CheckoutConsentScope signedIn={signedIn}>
          <div className="plans">
            <div className="plan">
              <h3>Free</h3>
              <p className="hint">Your first wall, ready to share.</p>
              <div className="price">$0</div>
              <ul>
                <li>Your wall at flexwall.lol/@handle</li>
                <li>{FREE_TILE_LIMIT} tiles</li>
                <li>GitHub, countdowns, notes, links</li>
                <li>Share card and a listing on The Wall</li>
                <li>Lock screen with a small flexwall.lol mark</li>
              </ul>
              <Link className="btn" href={signedIn ? ROUTES.edit : ROUTES.login}>{signedIn ? "Build my wall" : "Create a free wall"}</Link>
              <p className="hint">No credit card. No time limit.</p>
            </div>
            <div className="plan featured">
              <h3>Pro</h3>
              <div className="price">
                ${PLAN_PRICES_USD.monthly} <small>/ month</small>
              </div>
              <p className="hint">or ${PLAN_PRICES_USD.yearly / 12}/month, billed ${PLAN_PRICES_USD.yearly} yearly. Save {Math.round((1 - PLAN_PRICES_USD.yearly / (PLAN_PRICES_USD.monthly * 12)) * 100)}%.</p>
              <ul>
                <li>Everything in Free, up to {PAID_TILE_LIMIT} tiles</li>
                <li>Revenue verified directly with Stripe, Polar and more</li>
                <li>Connect your own API for custom live data</li>
                <li>History charts from daily snapshots</li>
                <li>Every theme, no watermark, no footer</li>
              </ul>
              <div className="row">
                <UpgradeButton plan="monthly" signedIn={signedIn} label="Go Pro monthly" primary={selectedPlan !== "yearly"} />
                <UpgradeButton plan="yearly" signedIn={signedIn} label={`Go Pro yearly · $${PLAN_PRICES_USD.yearly}`} primary={selectedPlan === "yearly"} />
              </div>
            </div>
          </div>
        </CheckoutConsentScope>
        <p className="plans-note">
          Connected bank and brokerage accounts cost ${PAID_ACCOUNT_PRICE_USD} a month each, on top of Pro, for as long as they stay connected.
        </p>
        <section className="pricing-questions" aria-label="Before you choose">
          <h2>See what you get before you sign up.</h2>
          <p><Link href={ROUTES.demo}>Try the interactive demo</Link> with sample data. No account or API key needed.</p>
          <details><summary>What does verified mean?</summary><p>A verified number is read from an account you connected at a supported provider, such as Stripe. Your own API is labeled as synchronized, and manually entered figures are not verified. Verification identifies the source; it is not a financial audit.</p></details>
          <details><summary>Do I have to publish my numbers?</summary><p>No. Your wall starts as a draft, and each tile can stay private. Only publish the figures you want visitors to see.</p></details>
          <details><summary>Can I cancel Pro?</summary><p>Yes, in Settings. Pro stays active until the end of the period you paid for. You can keep using the free plan afterwards.</p></details>
          <details><summary>When does my history start?</summary><p>Daily snapshots build as your connected numbers are loaded. History begins with the data Flexwall records; it does not import a full past history for every source.</p></details>
        </section>
      </main>
      <Footer />
    </div>
  );
}
