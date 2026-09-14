"use client";

import { useState } from "react";
import type { Entitlements, Subscription } from "@/domain/user";
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
              <UpgradeButton plan="monthly" label="Go Pro, $6/month" signedIn primary />
              <UpgradeButton plan="yearly" label="$48/year" signedIn />
              <UpgradeButton plan="lifetime" label="Lifetime, $99" signedIn />
            </div>
          </CheckoutConsentScope>
        ) : null}
        {hasCustomer ? (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
              const body = await res.json().catch(() => ({}));
              if (res.ok && body.url) window.location.assign(body.url);
              else setError(body.message ?? "Couldn't open billing.");
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
