"use client";

import { useState } from "react";

export function UpgradeButton({ plan, label, signedIn, primary }: { plan: "monthly" | "yearly" | "lifetime"; label: string; signedIn: boolean; primary?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!signedIn) {
    return (
      <a href="/login" className={`btn${primary ? " btn-signal" : ""}`}>
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
          setBusy(true);
          setError(null);
          const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.url) return window.location.assign(body.url);
          setBusy(false);
          setError(body.message ?? "Checkout didn't open.");
        }}
      >
        {busy ? "Opening…" : label}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
