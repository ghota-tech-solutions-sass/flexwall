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

export function isBillingPlan(value: unknown): value is BillingPlan {
  return BILLING_PLANS.includes(value as BillingPlan);
}
