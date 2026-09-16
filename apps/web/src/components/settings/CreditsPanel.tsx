"use client";

import { useState } from "react";
import type { CreditsView } from "@/application/use-cases/credits";
import { CREDIT_PACK_DETAILS, CREDIT_PACKS, monthsPerAccount, SUGGESTED_CREDIT_PACK, type CreditEntry, type CreditPack } from "@/domain/credits";
import { APP_LOCALE, DISPLAY_TIME_ZONE } from "@/domain/time";
import { postJson } from "@/presentation/json";
import { API, CREDITS_ANCHOR } from "@/presentation/routes";
import { CheckoutConsentScope, useCheckoutConsent } from "@/components/site/CheckoutConsent";

const REASON_LABELS: Record<CreditEntry["reason"], string> = { purchase: "Bought", spend: "Refresh", grant: "Offered", refund: "Taken back" };

// One locale and zone on server and browser alike, or hydration trips over "1,200" against "1 200".
const count = (n: number) => n.toLocaleString(APP_LOCALE);
const day = (at: number) => new Date(at).toLocaleDateString(APP_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/**
 * The balance of the accounts Flexwall reads with its own paid key, today X.
 * Settings only shows it to owners it concerns: someone who never connects X
 * never reads the word "credit".
 */
export function CreditsPanel({ view, justBought }: { view: CreditsView; justBought: boolean }) {
  const { balance, perDay, daysLeft, metered, recent } = view;
  return (
    <section className="panel" aria-labelledby={`${CREDITS_ANCHOR}-title`} id={CREDITS_ANCHOR}>
      <h2 id={`${CREDITS_ANCHOR}-title`}>Credits</h2>
      {justBought ? <p className="hint">Payment received. Your credits land as soon as Stripe confirms, usually within a few seconds.</p> : null}
      <div className="credits-balance">
        <strong className="credits-count">{count(balance)}</strong>
        <span>
          {balance === 1 ? "credit left" : "credits left"}
          {daysLeft ? ` · about ${plural(daysLeft, "day", "days")} at ${plural(perDay, "credit", "credits")} a day` : ""}
        </span>
      </div>
      <p>
        {metered.length ? `${metered.map((m) => m.label).join(", ")}: ` : ""}
        X charges Flexwall for every read, so these accounts cost one credit per day they refresh — whatever the number of tiles showing them. Days nobody
        views your wall cost nothing, and credits don&apos;t expire.
      </p>
      {balance === 0 && metered.length ? <p className="error">Out of credits: these tiles keep their last numbers until you top up.</p> : null}
      <CheckoutConsentScope signedIn purchase="credits">
        <div className="credit-packs">
          {CREDIT_PACKS.map((pack) => (
            <PackButton key={pack} pack={pack} />
          ))}
        </div>
      </CheckoutConsentScope>
      {recent.length ? (
        <details className="credit-history">
          <summary>Recent activity</summary>
          <ul className="conn-list">
            {recent.map((e) => (
              <li key={e.id}>
                <span>
                  {REASON_LABELS[e.reason]} {e.detail && e.reason !== "purchase" ? <span className="hint">{e.detail}</span> : null}
                </span>
                <span className="hint">
                  {e.amount > 0 ? `+${e.amount}` : e.amount} · {day(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function PackButton({ pack }: { pack: CreditPack }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consent = useCheckoutConsent();
  const { credits, priceUsd } = CREDIT_PACK_DETAILS[pack];
  const suggested = pack === SUGGESTED_CREDIT_PACK;
  return (
    <span className="credit-pack">
      <button
        type="button"
        className={`btn${suggested ? " btn-signal" : ""}`}
        disabled={busy}
        onClick={async () => {
          setError(null);
          if (!consent.accepted) return consent.flagMissing();
          setBusy(true);
          const res = await postJson<{ url: string }>(API.billingCredits, { pack, acceptedTerms: true });
          if (res.ok && res.body.url) return window.location.assign(res.body.url);
          setBusy(false);
          setError(res.body.message ?? "Checkout didn't open.");
        }}
      >
        {busy ? "Opening…" : `${count(credits)} credits · $${priceUsd}`}
      </button>
      <span className="hint">about {plural(monthsPerAccount(pack), "month", "months")} for one account</span>
      {consent.missing ? <span className="error">Tick the box below to continue.</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
