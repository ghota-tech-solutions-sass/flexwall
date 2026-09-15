"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CREDIT_NOTE_MAX, MAX_CREDIT_ADJUSTMENT } from "@/domain/credits";
import { sendJson } from "@/presentation/json";
import { API } from "@/presentation/routes";

/** Adds credits to an account, or takes some back with a negative number. Reloads the page from the server. */
export function CreditActions({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");
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
          const answer = await sendJson("POST", API.adminCredits(accountId), { amount: Number(amount), note });
          setBusy(false);
          if (!answer.ok) return setError(answer.body.message ?? "That didn't work. Try again.");
          setNote("");
          router.refresh();
        }}
      >
        <label className="field">
          <span>Credits</span>
          <input type="number" step={1} min={-MAX_CREDIT_ADJUSTMENT} max={MAX_CREDIT_ADJUSTMENT} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field admin-note">
          <span>Note</span>
          <input value={note} maxLength={CREDIT_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Support gesture, refund of unused credits…" />
        </label>
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {Number(amount) < 0 ? "Take back" : "Add credits"}
        </button>
      </form>
      <p className="hint">A negative number takes credits back, down to zero. Money is refunded in Stripe, not here.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
