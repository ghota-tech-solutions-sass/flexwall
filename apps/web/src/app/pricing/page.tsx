import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/site/Chrome";
import { CheckoutConsentScope } from "@/components/site/CheckoutConsent";
import { UpgradeButton } from "@/components/site/UpgradeButton";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Pricing", alternates: { canonical: "/pricing" } };

export default async function PricingPage() {
  const signedIn = Boolean(await sessionUserId());
  return (
    <div className="page">
      <TopBar signedIn={signedIn} />
      <main>
        <div className="prose" style={{ marginBlock: "24px 32px" }}>
          <h1>Pricing</h1>
          <p>Every wall is free and public. Pro is for when the numbers matter: verified revenue, history, a clean lock screen.</p>
          <p className="hint">Prices in US dollars, taxes included. Cancel any time from Settings.</p>
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
                $6 <small>/ month</small>
              </div>
              <p className="hint">or $48 a year</p>
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
                $99 <small>once</small>
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
