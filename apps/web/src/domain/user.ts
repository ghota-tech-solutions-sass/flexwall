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

export function planOf(user: Pick<User, "lifetime" | "subscription">, now: number): Plan {
  if (user.lifetime) return "lifetime";
  const s = user.subscription;
  if (!s) return "free";
  if (s.status === "active" || s.status === "trialing") return "pro";
  if (s.status === "past_due" && now < s.currentPeriodEnd + PAST_DUE_GRACE_MS) return "pro";
  return "free";
}

/** The only place that turns a plan into what a user may do. */
export function entitlementsOf(user: Pick<User, "lifetime" | "subscription">, now: number): Entitlements {
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
  };
}
