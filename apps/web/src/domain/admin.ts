import { DomainError } from "./errors";
import type { Complimentary, User } from "./user";

/**
 * Who may look after accounts: the emails the operator lists. Nobody is an
 * administrator when the list is empty, so a server without it has no back office.
 */
export function isAdministrator(user: Pick<User, "email"> | null, administrators: readonly string[]): boolean {
  if (!user) return false;
  const email = user.email.trim().toLowerCase();
  return administrators.some((a) => a.trim().toLowerCase() === email);
}

/** "a@x.com, B@y.com" as the operator types it, as a clean list. */
export function parseAdministrators(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** How long Pro can be offered for. */
export const COMPLIMENTARY_TERMS = ["1m", "3m", "1y", "forever"] as const;
export type ComplimentaryTerm = (typeof COMPLIMENTARY_TERMS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const TERM_DAYS: Record<Exclude<ComplimentaryTerm, "forever">, number> = { "1m": 30, "3m": 90, "1y": 365 };
export const COMPLIMENTARY_NOTE_MAX = 200;

/**
 * Offered Pro for a term. Offering again while it runs extends from its
 * current end, the way referral months stack, rather than cutting it short.
 */
export function offerPro(user: User, input: { term: ComplimentaryTerm; note: string; by: string; now: number }): User {
  if (!COMPLIMENTARY_TERMS.includes(input.term)) throw new DomainError("invalid_input", "Pick how long to offer Pro for.");
  const note = input.note.trim();
  if (note.length > COMPLIMENTARY_NOTE_MAX) throw new DomainError("invalid_input", `Keep the note under ${COMPLIMENTARY_NOTE_MAX} characters.`);
  const current = user.complimentary;
  let until: number | null = null;
  if (input.term !== "forever") {
    if (current && current.until === null) throw new DomainError("invalid_input", "Pro is already offered with no end. Take it back first to set a term.");
    const from = Math.max(input.now, current?.until ?? 0);
    until = from + TERM_DAYS[input.term] * DAY_MS;
  }
  const complimentary: Complimentary = { until, grantedAt: input.now, grantedBy: input.by, note };
  return { ...user, complimentary };
}

export function withdrawPro(user: User): User {
  return { ...user, complimentary: null };
}
