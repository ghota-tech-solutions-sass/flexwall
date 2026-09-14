import type { User } from "./user";

/**
 * "Give 20%, get a month": an invitee gets a discount on their first payment,
 * and the person who invited them gets a month of Pro once that payment lands.
 */

export const REFERRAL_DISCOUNT_PERCENT = 20;
export const REFERRAL_REWARD_DAYS = 30;
/** Rewarded invitees per referrer; the ones beyond still count, they just don't add Pro time. */
export const REFERRAL_REWARD_CAP = 12;
/** A refund this soon after the first payment takes the month back. */
export const REFERRAL_REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const REFERRAL_COOKIE = "fw_ref";
export const REFERRAL_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const REWARD_MS = REFERRAL_REWARD_DAYS * DAY_MS;

export type ReferralStatus = "signed_up" | "converted" | "refunded";

export interface Referral {
  /** The invitee's user id: one referral per invitee. */
  id: string;
  referrerId: string;
  refereeId: string;
  createdAt: number;
  status: ReferralStatus;
  convertedAt: number | null;
  /** Whether the conversion added Pro time; false past the cap. */
  rewarded: boolean;
}

export function newReferral(input: { referrerId: string; refereeId: string; now: number }): Referral {
  return { id: input.refereeId, referrerId: input.referrerId, refereeId: input.refereeId, createdAt: input.now, status: "signed_up", convertedAt: null, rewarded: false };
}

/** Nobody invites themselves, under another account with the same address included. */
export function canRefer(referrer: Pick<User, "id" | "email">, referee: Pick<User, "id" | "email">): boolean {
  return referrer.id !== referee.id && referrer.email.trim().toLowerCase() !== referee.email.trim().toLowerCase();
}

/** Marks the invitee's first payment; says whether it earns the referrer a month. */
export function convert(referral: Referral, rewardedSoFar: number, now: number): Referral {
  return { ...referral, status: "converted", convertedAt: now, rewarded: rewardedSoFar < REFERRAL_REWARD_CAP };
}

/** A month of Pro, added after whatever Pro time is left. */
export function grantMonth(referrer: User, now: number): User {
  const from = Math.max(now, referrer.bonusProUntil ?? 0);
  return { ...referrer, bonusProUntil: from + REWARD_MS };
}

/** A refund inside the window undoes the conversion, and the month it earned. */
export function refundable(referral: Referral, now: number): boolean {
  return referral.status === "converted" && referral.convertedAt !== null && now - referral.convertedAt <= REFERRAL_REFUND_WINDOW_MS;
}

export function takeMonthBack(referrer: User, now: number): User {
  const until = (referrer.bonusProUntil ?? 0) - REWARD_MS;
  return { ...referrer, bonusProUntil: until > now ? until : null };
}

export interface ReferralSummary {
  signedUp: number;
  converted: number;
  daysEarned: number;
  /** Epoch ms while referral Pro time remains, else null. */
  proUntil: number | null;
}

export function summarize(referrals: Referral[], referrer: Pick<User, "bonusProUntil">, now: number): ReferralSummary {
  const converted = referrals.filter((r) => r.status === "converted");
  const until = referrer.bonusProUntil ?? 0;
  return {
    signedUp: referrals.length,
    converted: converted.length,
    daysEarned: converted.filter((r) => r.rewarded).length * REFERRAL_REWARD_DAYS,
    proUntil: until > now ? until : null,
  };
}
