import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/site/Chrome";
import { CheckoutConsentScope } from "@/components/site/CheckoutConsent";
import { UpgradeButton } from "@/components/site/UpgradeButton";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { container } from "@/composition";
import { PLAN_PRICES_USD } from "@/domain/pricing";
import { REFERRAL_DISCOUNT_PERCENT } from "@/domain/referral";
import { sessionUserId } from "@/presentation/http";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { softwareApplicationLd } from "@/presentation/seo/structured-data";
import { ROUTES } from "@/presentation/routes";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `Every public wall is free. Pro is $${PLAN_PRICES_USD.monthly} a month or $${PLAN_PRICES_USD.yearly} a year for verified revenue, history and a clean lock screen. Lifetime is $${PLAN_PRICES_USD.lifetime} once.`,
  path: ROUTES.pricing,
});

export default async function PricingPage() {
  const userId = await sessionUserId();
  const signedIn = Boolean(userId);
  const invitedBy = userId ? ((await container().getReferralProgram.execute({ userId }))?.invitedBy ?? null) : null;
  return (
    <div className="page">
      <JsonLd data={softwareApplicationLd(siteOrigin())} />
      <TopBar signedIn={signedIn} />
      <main>
        <div className="page-head dotted">
          <h1 className="display">Pricing</h1>
          <p>Every wall is free and public. Pro is for when the numbers matter: verified revenue, history, a clean lock screen.</p>
          <p className="hint">Prices in US dollars, taxes included. Cancel any time from Settings.</p>
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
              <div className="price">$0</div>
              <ul>
                <li>Your wall at flexwall.lol/@handle</li>
                <li>{FREE_TILE_LIMIT} tiles</li>
                <li>GitHub, countdowns, notes, links</li>
                <li>Share card and a listing on The Wall</li>
                <li>Lock screen with a small flexwall.lol mark</li>
              </ul>
            </div>
            <div className="plan featured">
              <h3>Pro</h3>
              <div className="price">
                ${PLAN_PRICES_USD.monthly} <small>/ month</small>
              </div>
              <p className="hint">or ${PLAN_PRICES_USD.yearly} a year</p>
              <ul>
                <li>Everything in Free, unlimited tiles</li>
                <li>Verified Stripe revenue and your own API</li>
                <li>History charts from daily snapshots</li>
                <li>Every theme, no watermark, no footer</li>
              </ul>
              <div className="row">
                <UpgradeButton plan="monthly" signedIn={signedIn} label="Go Pro monthly" primary />
                <UpgradeButton plan="yearly" signedIn={signedIn} label="Yearly" />
              </div>
            </div>
            <div className="plan">
              <h3>Lifetime</h3>
              <div className="price">
                ${PLAN_PRICES_USD.lifetime} <small>once</small>
              </div>
              <ul>
                <li>Pro, forever</li>
                <li>For the first supporters: this plan will close</li>
              </ul>
              <UpgradeButton plan="lifetime" signedIn={signedIn} label="Get lifetime" />
            </div>
          </div>
        </CheckoutConsentScope>
      </main>
      <Footer />
    </div>
  );
}
