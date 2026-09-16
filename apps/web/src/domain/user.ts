import type { Handle } from "./handle";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  interval: "month" | "year";
  /** Epoch ms. */
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  /** How many of it: one for Pro, the number of paid accounts for the accounts subscription. */
  quantity: number;
  /** Epoch ms of the event that produced this state; a later one wins, an older one is ignored. */
  updatedAt: number;
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
  /** Pro given by an administrator, free of charge. Older accounts have it undefined. */
  complimentary?: Complimentary | null;
  /** The monthly subscription paying for connected bank and brokerage accounts. Never grants Pro. */
  paidAccounts?: Subscription | null;
  /** Accounts an administrator gave for nothing, and what owners connected before this was billed. */
  paidAccountsGranted?: number | null;
}

/** Pro offered from the administration: nobody pays, Stripe knows nothing about it. */
export interface Complimentary {
  /** Epoch ms when it ends; null keeps it until an administrator takes it back. */
  until: number | null;
  grantedAt: number;
  /** The administrator's email, for the record. */
  grantedBy: string;
  /** Why, in the administrator's words. */
  note: string;
}

/** Whether offered Pro is in force at `now`. */
export function complimentaryActive(user: { complimentary?: Complimentary | null }, now: number): boolean {
  const c = user.complimentary;
  return Boolean(c) && (c!.until === null || c!.until > now);
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

type PlanFacts = Pick<User, "lifetime" | "subscription"> & { bonusProUntil?: number | null; complimentary?: Complimentary | null };

/** What the user pays for, ignoring referral rewards: decides whether they can subscribe again. Paid accounts are an add-on, never a plan. */
export function paidPlanOf(user: PlanFacts, now: number): Plan {
  if (user.lifetime) return "lifetime";
  const s = user.subscription;
  if (!s) return "free";
  if (s.status === "active" || s.status === "trialing") return "pro";
  if (s.status === "past_due" && now < s.currentPeriodEnd + PAST_DUE_GRACE_MS) return "pro";
  return "free";
}

/** The plan in force: what they pay for, or Pro while it's offered or referral rewards last. */
export function planOf(user: PlanFacts, now: number): Plan {
  const paid = paidPlanOf(user, now);
  if (paid !== "free") return paid;
  if (complimentaryActive(user, now)) return "pro";
  return (user.bonusProUntil ?? 0) > now ? "pro" : "free";
}

/** Why a user has the plan they have, for the people who look after accounts. */
export type PlanSource = "lifetime" | "subscription" | "complimentary" | "referral" | "free";

export function planSourceOf(user: PlanFacts, now: number): PlanSource {
  const paid = paidPlanOf(user, now);
  if (paid === "lifetime") return "lifetime";
  if (paid === "pro") return "subscription";
  if (complimentaryActive(user, now)) return "complimentary";
  return (user.bonusProUntil ?? 0) > now ? "referral" : "free";
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
    complimentary: null,
    paidAccounts: null,
    paidAccountsGranted: null,
  };
}
