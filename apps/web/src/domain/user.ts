import type { Handle } from "./handle";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  interval: "month" | "year";
  /** Epoch ms. */
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

export interface User {
  id: string;
  email: string;
  handle: Handle | null;
  /** IANA zone, so "today" on the wall is the owner's today. */
  timeZone: string;
  createdAt: number;
  stripeCustomerId: string | null;
  subscription: Subscription | null;
  lifetime: boolean;
  /** The user who invited this one, if any. Accounts created before referrals have it undefined. */
  referredBy: string | null;
  /** Epoch ms until which referral rewards keep Pro on. Accounts created before referrals have it undefined. */
  bonusProUntil: number | null;
}

export type Plan = "free" | "pro" | "lifetime";

export interface Entitlements {
  plan: Plan;
  paid: boolean;
  maxTiles: number;
  /** Connectors with `tier: "pro"` render on the public wall. */
  proConnectors: boolean;
  proThemes: boolean;
  history: boolean;
  /** Lock screen carries a flexwall.lol mark. */
  watermark: boolean;
  /** "Made with Flexwall" under the public wall. */
  branding: boolean;
}

export const FREE_TILE_LIMIT = 8;
export const PAID_TILE_LIMIT = 60;
/** A failed renewal keeps Pro this long while Stripe retries the card. */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type PlanFacts = Pick<User, "lifetime" | "subscription"> & { bonusProUntil?: number | null };

/** What the user pays for, ignoring referral rewards: decides whether they can subscribe again. */
export function paidPlanOf(user: PlanFacts, now: number): Plan {
  if (user.lifetime) return "lifetime";
  const s = user.subscription;
  if (!s) return "free";
  if (s.status === "active" || s.status === "trialing") return "pro";
  if (s.status === "past_due" && now < s.currentPeriodEnd + PAST_DUE_GRACE_MS) return "pro";
  return "free";
}

/** The plan in force: what they pay for, or Pro while referral rewards last. */
export function planOf(user: PlanFacts, now: number): Plan {
  const paid = paidPlanOf(user, now);
  if (paid !== "free") return paid;
  return (user.bonusProUntil ?? 0) > now ? "pro" : "free";
}

/** The only place that turns a plan into what a user may do. */
export function entitlementsOf(user: PlanFacts, now: number): Entitlements {
  const plan = planOf(user, now);
  const paid = plan !== "free";
  return {
    plan,
    paid,
    maxTiles: paid ? PAID_TILE_LIMIT : FREE_TILE_LIMIT,
    proConnectors: paid,
    proThemes: paid,
    history: paid,
    watermark: !paid,
    branding: !paid,
  };
}

export function newUser(input: { id: string; email: string; now: number; timeZone?: string }): User {
  return {
    id: input.id,
    email: input.email.trim().toLowerCase(),
    handle: null,
    timeZone: input.timeZone ?? "UTC",
    createdAt: input.now,
    stripeCustomerId: null,
    subscription: null,
    lifetime: false,
    referredBy: null,
    bonusProUntil: null,
  };
}
