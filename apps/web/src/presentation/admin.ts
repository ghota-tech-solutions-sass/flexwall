import type { ComplimentaryTerm } from "@/domain/admin";
import type { Availability, PolicyOverride } from "@/domain/connector-policy";
import type { Plan, PlanSource } from "@/domain/user";
import { APP_LOCALE, DISPLAY_TIME_ZONE } from "@/domain/time";

/** How the back office names where a plan comes from. */
export const PLAN_SOURCE_LABELS: Record<PlanSource, string> = {
  subscription: "Subscription",
  lifetime: "Lifetime",
  complimentary: "Offered",
  referral: "Referral rewards",
  free: "Free",
};

export const PLAN_LABELS: Record<Plan, string> = { free: "Free", pro: "Pro", lifetime: "Lifetime" };

/** How the back office names who may use a connector. */
export const AVAILABILITY_LABELS: Record<Availability, string> = { everyone: "Everyone", admins: "Administrators only", off: "Nobody" };

/** Why a connector isn't what an administrator asked for. */
export function overrideLine(override: PolicyOverride): string | null {
  if (override === "unconfigured") return "No server credentials: nobody can use it.";
  if (override === "sandbox") return "Sandbox keys: test data stays with administrators.";
  return null;
}

export const TERM_LABELS: Record<ComplimentaryTerm, string> = { "1m": "1 month", "3m": "3 months", "1y": "1 year", forever: "With no end" };

/** The filters on the account list, in the order they show. */
export const SOURCE_FILTERS: { value: PlanSource | "all"; label: string }[] = [
  { value: "all", label: "All accounts" },
  { value: "subscription", label: PLAN_SOURCE_LABELS.subscription },
  { value: "lifetime", label: PLAN_SOURCE_LABELS.lifetime },
  { value: "complimentary", label: PLAN_SOURCE_LABELS.complimentary },
  { value: "referral", label: PLAN_SOURCE_LABELS.referral },
  { value: "free", label: PLAN_SOURCE_LABELS.free },
];

export function adminSource(raw: string | undefined): PlanSource | "all" {
  return SOURCE_FILTERS.find((f) => f.value === raw)?.value ?? "all";
}

/** "Sep 15, 2026", the same for every administrator whatever their browser. */
export function adminDate(at: number | null | undefined): string {
  if (!at) return "—";
  return new Date(at).toLocaleDateString(APP_LOCALE, { year: "numeric", month: "short", day: "numeric", timeZone: DISPLAY_TIME_ZONE });
}

/** A Stripe customer in the dashboard. */
export function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${encodeURIComponent(customerId)}`;
}
