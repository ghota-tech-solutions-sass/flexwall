"use client";

import { useState } from "react";
import type { ReferralProgram } from "@/application/use-cases/referrals";
import { REFERRAL_DISCOUNT_PERCENT, REFERRAL_REWARD_CAP, REFERRAL_REWARD_DAYS } from "@/domain/referral";
import { COPIED_FEEDBACK_MS } from "@/presentation/feedback";

export function ReferralPanel({ program }: { program: ReferralProgram }) {
  const [copied, setCopied] = useState(false);
  const { link, summary } = program;
  return (
    <section className="panel" aria-labelledby="invite">
      <h2 id="invite">Invite friends</h2>
      <p>
        Friends who sign up with your link get {REFERRAL_DISCOUNT_PERCENT}% off their first payment. Each one who pays gives you {REFERRAL_REWARD_DAYS} days of
        Pro, up to {REFERRAL_REWARD_CAP} months.
      </p>
      {link ? (
        <div className="row">
          <input value={link} readOnly aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : (
        <p className="hint">Pick a handle to get your invite link.</p>
      )}
      <ul>
        <li>Signed up: {summary.signedUp}</li>
        <li>Paid: {summary.converted}</li>
        <li>
          Pro earned: {summary.daysEarned} days
          {summary.proUntil ? `, running until ${new Date(summary.proUntil).toLocaleDateString()}` : ""}
        </li>
      </ul>
    </section>
  );
}
