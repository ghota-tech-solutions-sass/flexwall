"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_PAID_ACCOUNTS } from "@/domain/pricing";
import { sendJson } from "@/presentation/json";
import { API } from "@/presentation/routes";

/** Gives an account bank or brokerage accounts for nothing, or takes some back. Nothing here goes through Stripe. */
export function PaidAccountActions({ accountId, granted }: { accountId: string; granted: number }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(String(granted));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="admin-actions">
      <form
        className="admin-offer"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const answer = await sendJson("POST", API.adminPaidAccounts(accountId), { accounts: Number(accounts) });
          setBusy(false);
          if (!answer.ok) return setError(answer.body.message ?? "That didn't work. Try again.");
          router.refresh();
        }}
      >
        <label className="field">
          <span>Accounts offered</span>
          <input type="number" step={1} min={0} max={MAX_PAID_ACCOUNTS} value={accounts} onChange={(e) => setAccounts(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          Save
        </button>
      </form>
      <p className="hint">The number of accounts this owner may keep connected without paying. Zero takes the gift back; what they pay for themselves stays.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
