/**
 * Credits pay for connectors that read with Flexwall's own paid key (X today).
 * One credit keeps one connection fresh for one UTC day: it's spent the first
 * time that day the connection reaches the upstream, and every other refresh
 * that day is free. A day nobody views the wall costs nothing.
 *
 * Why these numbers. X bills a profile read $0.010 and counts the same profile
 * once per UTC day, so a credit costs Flexwall at most one cent. Packs sell
 * credits at 2.5 to 4 cents, taxes included, so the smallest pack still covers
 * VAT, card fees and the read itself when every credit is used. Prices match
 * terraform/variables.tf credits_*_cents.
 */

export const CREDIT_PACKS = ["starter", "regular", "large"] as const;
export type CreditPack = (typeof CREDIT_PACKS)[number];

export const CREDIT_PACK_DETAILS: Record<CreditPack, { credits: number; priceUsd: number }> = {
  starter: { credits: 100, priceUsd: 3.99 },
  regular: { credits: 400, priceUsd: 11.99 },
  large: { credits: 1200, priceUsd: 29.99 },
};

/** The pack settings suggest first. */
export const SUGGESTED_CREDIT_PACK: CreditPack = "regular";

/** The most an administrator grants or takes back in one go: a typo shouldn't hand out a fortune. */
export const MAX_CREDIT_ADJUSTMENT = 10_000;
export const CREDIT_NOTE_MAX = 200;

export function isCreditPack(value: unknown): value is CreditPack {
  return CREDIT_PACKS.includes(value as CreditPack);
}

/** The day credits are counted in: UTC, like the provider's own daily deduplication. */
export function creditDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Cents per credit, rounded to a tenth: what the pack picker compares. */
export function centsPerCredit(pack: CreditPack): number {
  const { credits, priceUsd } = CREDIT_PACK_DETAILS[pack];
  return Math.round((priceUsd * 1000) / credits) / 10;
}

/**
 * Whole days the balance lasts if every metered connection refreshes every day.
 * Null when nothing spends credits.
 */
export function daysLeft(balance: number, creditsPerDay: number): number | null {
  if (creditsPerDay <= 0) return null;
  return Math.max(0, Math.floor(balance / creditsPerDay));
}

/** One change to a balance. Spending is keyed by connection and day, so a day is never charged twice. */
export interface CreditEntry {
  id: string;
  userId: string;
  /** Positive when credits come in, negative when they go out. */
  amount: number;
  reason: "purchase" | "spend" | "grant" | "refund";
  at: number;
  /** What it was for: the pack bought, the connection read, the administrator's note. */
  detail: string;
}

export type SpendOutcome = "charged" | "already_paid" | "insufficient";
