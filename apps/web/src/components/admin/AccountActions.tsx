"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMPLIMENTARY_NOTE_MAX, COMPLIMENTARY_TERMS, type ComplimentaryTerm } from "@/domain/admin";
import { TERM_LABELS } from "@/presentation/admin";
import { sendJson } from "@/presentation/json";
import { API } from "@/presentation/routes";

interface Props {
  accountId: string;
  hasOffer: boolean;
  /** Pro offered with no end: a term can't be stacked on it. */
  offerHasNoEnd: boolean;
  wall: { published: boolean; listed: boolean } | null;
  section: "plan" | "wall";
}

/** What an administrator can change on an account. Every change reloads the page from the server. */
export function AccountActions({ accountId, hasOffer, offerHasNoEnd, wall, section }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState<ComplimentaryTerm>("1m");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const run = async (call: () => ReturnType<typeof sendJson>) => {
    setBusy(true);
    setError(null);
    const answer = await call();
    setBusy(false);
    if (!answer.ok) return setError(answer.body.message ?? "That didn't work. Try again.");
    setConfirmingWithdraw(false);
    setNote("");
    router.refresh();
  };

  if (section === "wall" && wall) {
    return (
      <div className="admin-actions">
        <div className="row">
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => sendJson("POST", API.adminWall(accountId), { published: !wall.published }))}>
            {wall.published ? "Unpublish the page" : "Publish the page"}
          </button>
          <button type="button" className="btn btn-small" disabled={busy || !wall.published} onClick={() => run(() => sendJson("POST", API.adminWall(accountId), { listed: !wall.listed }))}>
            {wall.listed ? "Take off The Wall" : "List on The Wall"}
          </button>
        </div>
        <p className="hint">
          {wall.published ? "The page is public" : "The page is offline"}
          {wall.published ? (wall.listed ? " and listed on The Wall." : ", not listed on The Wall.") : "."} The owner can change it back from the editor.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="admin-actions">
      <form
        className="admin-offer"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => sendJson("POST", API.adminPro(accountId), { term, note }));
        }}
      >
        <label className="field">
          <span>Offer Pro</span>
          <select value={term} onChange={(e) => setTerm(e.target.value as ComplimentaryTerm)}>
            {COMPLIMENTARY_TERMS.map((t) => (
              <option key={t} value={t} disabled={offerHasNoEnd && t !== "forever"}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field admin-note">
          <span>Note</span>
          <input value={note} maxLength={COMPLIMENTARY_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Beta tester, partner, support gesture…" />
        </label>
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {hasOffer ? "Extend" : "Offer Pro"}
        </button>
      </form>
      <p className="hint">No payment and nothing in Stripe. A term added while Pro is offered starts where the current one ends.</p>
      {hasOffer ? (
        confirmingWithdraw ? (
          <div className="row">
            <span className="hint">Pro stops now unless the account pays or has referral months.</span>
            <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => run(() => sendJson("DELETE", API.adminPro(accountId)))}>
              Take Pro back
            </button>
            <button type="button" className="btn btn-small" onClick={() => setConfirmingWithdraw(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="link" onClick={() => setConfirmingWithdraw(true)}>
            Take offered Pro back
          </button>
        )
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
