"use client";

import { useState } from "react";
import { useCheckoutConsent } from "./CheckoutConsent";
import type { BillingPlan } from "@/domain/pricing";
import { postJson } from "@/presentation/json";
import { API, ROUTES } from "@/presentation/routes";

export function UpgradeButton({ plan, label, signedIn, primary }: { plan: BillingPlan; label: string; signedIn: boolean; primary?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const consent = useCheckoutConsent();
  if (!signedIn) {
    return (
      <a href={ROUTES.login} className={`btn${primary ? " btn-signal" : ""}`}>
        {label}
      </a>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        className={`btn${primary ? " btn-signal" : ""}`}
        disabled={busy}
        onClick={async () => {
          setError(null);
          if (!consent.accepted) return consent.flagMissing();
          setBusy(true);
          const res = await postJson<{ url: string }>(API.billingCheckout, { plan, acceptedTerms: true });
          if (res.ok && res.body.url) return window.location.assign(res.body.url);
          setBusy(false);
          setError(res.body.message ?? "Checkout didn't open.");
        }}
      >
        {busy ? "Opening…" : label}
      </button>
      {consent.missing ? <span className="error">Tick the box below the plans to continue.</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
