"use client";

import Link from "next/link";
import { ROUTES } from "@/presentation/routes";
import { createContext, type ReactNode, useContext, useId, useState } from "react";

const ConsentContext = createContext<{ accepted: boolean; missing: boolean; flagMissing: () => void }>({
  accepted: false,
  missing: false,
  flagMissing: () => {},
});

/** Whether the buyer ticked the terms box; upgrade buttons ask before opening checkout. */
export function useCheckoutConsent() {
  return useContext(ConsentContext);
}

/**
 * The terms box every checkout goes through: acceptance of the terms, and the
 * express request for Pro, or a paid account, to start before the 14-day
 * withdrawal period ends.
 */
export function CheckoutConsentScope({ signedIn, children, purchase = "pro" }: { signedIn: boolean; children: ReactNode; purchase?: "pro" | "paid-account" }) {
  const [accepted, setAccepted] = useState(false);
  const [missing, setMissing] = useState(false);
  const id = useId();
  return (
    <ConsentContext.Provider value={{ accepted, missing: missing && !accepted, flagMissing: () => setMissing(true) }}>
      {children}
      {signedIn ? (
        <label className="consent" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            aria-invalid={missing && !accepted}
          />
          <span>
            {purchase === "paid-account" ? (
              <>
                I accept the <Link href={ROUTES.terms}>terms of service</Link> and the <Link href={ROUTES.privacy}>privacy policy</Link>, and I ask for the account to
                start as soon as I pay, before the 14-day withdrawal period ends. An account I haven&apos;t used is refunded on request within those 14 days.
              </>
            ) : (
              <>
                I accept the <Link href={ROUTES.terms}>terms of service</Link> and the <Link href={ROUTES.privacy}>privacy policy</Link>, and I ask for Pro to start as soon
                as I pay, before the 14-day withdrawal period ends. I keep a full refund on request within those 14 days.
              </>
            )}
          </span>
        </label>
      ) : null}
    </ConsentContext.Provider>
  );
}
