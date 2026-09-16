"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaidAccountsView } from "@/application/use-cases/paid-accounts";
import { APP_LOCALE, DISPLAY_TIME_ZONE } from "@/domain/time";
import { catalog } from "@/plugins/registry";
import { postJson } from "@/presentation/json";
import { API, PAID_ACCOUNTS_ANCHOR } from "@/presentation/routes";
import { CheckoutConsentScope, useCheckoutConsent } from "@/components/site/CheckoutConsent";

// One locale and zone on server and browser alike, or hydration trips over "1,200" against "1 200".
const count = (n: number) => n.toLocaleString(APP_LOCALE);
const day = (at: number) => new Date(at).toLocaleDateString(APP_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/**
 * The bank and brokerage accounts an owner pays for, month by month. Settings
 * only shows it to owners it concerns: someone who connects nothing but GitHub
 * never reads the price of a bank.
 */
export function PaidAccountsPanel({ view, justAdded }: { view: PaidAccountsView; justAdded: boolean }) {
  const { allowance, used, priceUsd, monthlyUsd, max, renewsAt, endsAtPeriodEnd, behindOnPayment, accounts, granted } = view;
  return (
    <section className="panel" aria-labelledby={`${PAID_ACCOUNTS_ANCHOR}-title`} id={PAID_ACCOUNTS_ANCHOR}>
      <h2 id={`${PAID_ACCOUNTS_ANCHOR}-title`}>Accounts</h2>
      {justAdded ? <p className="hint">Payment received. The account opens as soon as Stripe confirms, usually within a few seconds.</p> : null}
      <div className="paid-accounts-balance">
        <strong className="paid-accounts-count">{count(allowance)}</strong>
        <span>
          {allowance === 1 ? "account paid for" : "accounts paid for"} · {count(used)} connected
          {monthlyUsd ? ` · $${count(monthlyUsd)} a month` : ""}
        </span>
      </div>
      <p>
        Banks and brokerages are read through a provider that charges Flexwall every month an account stays connected, so each one costs ${priceUsd} a month
        on top of your plan, taxes included. Adding or removing one is prorated, and disconnecting an account stops its billing. {max} accounts at most.
      </p>
      {behindOnPayment ? <p className="error">A payment didn&apos;t go through. Update your card from Invoices and cancellation above, or these accounts go quiet.</p> : null}
      {endsAtPeriodEnd && renewsAt ? (
        <p className="hint">These accounts end on {day(renewsAt)} and aren&apos;t billed again.</p>
      ) : renewsAt ? (
        <p className="hint">Renews on {day(renewsAt)}.</p>
      ) : null}
      {granted ? <p className="hint">{plural(granted, "account", "accounts")} offered by Flexwall, at no charge.</p> : null}
      {accounts.length ? (
        <ul className="conn-list">
          {accounts.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{catalog.connector(a.connector)?.name ?? a.connector}</strong> {a.label}
              </span>
              <span className={a.covered ? "hint" : "error"}>{a.covered ? `$${priceUsd} a month` : "Not covered — pay for it to show again"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <CheckoutConsentScope signedIn purchase="paid-account">
        <AddAccountButton priceUsd={priceUsd} atMax={Math.max(allowance, used) >= max} />
      </CheckoutConsentScope>
    </section>
  );
}

function AddAccountButton({ priceUsd, atMax }: { priceUsd: number; atMax: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consent = useCheckoutConsent();
  return (
    <span className="paid-account-add">
      <button
        type="button"
        className="btn btn-signal"
        disabled={busy || atMax}
        onClick={async () => {
          setError(null);
          if (!consent.accepted) return consent.flagMissing();
          setBusy(true);
          // The first account opens a checkout; the ones after it only raise the quantity on the running subscription, and the page reads itself again.
          const res = await postJson<{ mode: "checkout" | "added"; url: string }>(API.billingPaidAccounts, { acceptedTerms: true });
          if (res.ok && res.body.mode === "checkout" && res.body.url) return window.location.assign(res.body.url);
          setBusy(false);
          if (res.ok && res.body.mode === "added") return router.refresh();
          setError(res.body.message ?? "That didn't work. Try again.");
        }}
      >
        {busy ? "Opening…" : `Add an account · $${priceUsd}/month`}
      </button>
      {atMax ? <span className="hint">You have every account Flexwall allows.</span> : null}
      {consent.missing ? <span className="error">Tick the box below to continue.</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
