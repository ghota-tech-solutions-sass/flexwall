"use client";

import { useState } from "react";
import type { Entitlements, Subscription } from "@/domain/user";
import { PLAN_PRICES_USD } from "@/domain/pricing";
import { postJson } from "@/presentation/json";
import { API } from "@/presentation/routes";
import { CheckoutConsentScope } from "@/components/site/CheckoutConsent";
import { UpgradeButton } from "@/components/site/UpgradeButton";

export function BillingPanel({
  entitlements,
  subscription,
  hasCustomer,
  bonusProUntil,
  paidPlan,
}: {
  entitlements: Entitlements;
  subscription: Subscription | null;
  hasCustomer: boolean;
  /** Epoch ms while referral rewards keep Pro on. */
  bonusProUntil: number | null;
  /** The plan paid for, ignoring referral rewards. */
  paidPlan: Entitlements["plan"];
}) {
  const [error, setError] = useState<string | null>(null);
  const renews = subscription ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : null;
  const onRewards = entitlements.plan === "pro" && paidPlan === "free";
  return (
    <section className="panel" aria-labelledby="billing">
      <h2 id="billing">Plan</h2>
      <p>
        {entitlements.plan === "lifetime"
          ? "Lifetime. Thank you for backing Flexwall early."
          : onRewards
            ? `Pro from referral rewards until ${new Date(bonusProUntil ?? 0).toLocaleDateString()}. Subscribe to keep it after that.`
            : entitlements.plan === "pro"
            ? `Pro, ${subscription?.interval === "year" ? "yearly" : "monthly"}. ${subscription?.cancelAtPeriodEnd ? `Ends on ${renews}.` : `Renews on ${renews}.`}`
            : `Free: ${entitlements.maxTiles} tiles, public connectors, watermarked lock screen.`}
      </p>
      <div className="row">
        {paidPlan === "free" ? (
          <CheckoutConsentScope signedIn>
            <div className="row">
              <UpgradeButton plan="monthly" label={`Go Pro, $${PLAN_PRICES_USD.monthly}/month`} signedIn primary />
              <UpgradeButton plan="yearly" label={`$${PLAN_PRICES_USD.yearly}/year`} signedIn />
              <UpgradeButton plan="lifetime" label={`Lifetime, $${PLAN_PRICES_USD.lifetime}`} signedIn />
            </div>
          </CheckoutConsentScope>
        ) : null}
        {hasCustomer ? (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const res = await postJson<{ url: string }>(API.billingPortal);
              if (res.ok && res.body.url) window.location.assign(res.body.url);
              else setError(res.body.message ?? "Couldn't open billing.");
            }}
          >
            Invoices and cancellation
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
