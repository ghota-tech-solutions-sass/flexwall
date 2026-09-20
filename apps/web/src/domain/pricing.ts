/**
 * What Flexwall costs. Public prices in US dollars, taxes included; the
 * payment provider holds the same amounts (terraform/variables.tf price_*_cents).
 */

export const BILLING_PLANS = ["monthly", "yearly", "lifetime"] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

/** The plan a checkout opens on when the request doesn't name a known one. */
export const DEFAULT_BILLING_PLAN: BillingPlan = "monthly";

export const PRICE_CURRENCY = "USD";

export const PLAN_PRICES_USD: Record<BillingPlan, number> = { monthly: 6, yearly: 48, lifetime: 99 };

/** The plans still on sale. Lifetime stays in BILLING_PLANS: owners keep theirs, and its price still answers replayed events. */
export const SELLABLE_BILLING_PLANS = ["monthly", "yearly"] as const satisfies readonly BillingPlan[];

/**
 * What one connected bank or brokerage account costs a month, taxes included.
 * Those connections cost Flexwall a monthly fee at the provider (SnapTrade
 * bills $1-2 per connected user, Plaid a subscription per Item), so they are
 * paid for by the account, prorated, for as long as they stay connected.
 */
export const PAID_ACCOUNT_PRICE_USD = 5;

/** A bug must never bill someone for fifty banks. */
export const MAX_PAID_ACCOUNTS = 10;

export function isBillingPlan(value: unknown): value is BillingPlan {
  return BILLING_PLANS.includes(value as BillingPlan);
}

/** Public checkout choices only; never revive the retired lifetime offer through a URL. */
export function sellablePlan(value: unknown): "monthly" | "yearly" | undefined {
  return value === "monthly" || value === "yearly" ? value : undefined;
}
