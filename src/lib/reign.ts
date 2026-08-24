import type { WallEvent } from "@/lib/store/entries";

export interface Reign {
  /** Timestamp when the current leader took №01. */
  since: number;
  /** Payments by OTHER seats since the reign started (challenges that failed to take №01). */
  challenges: number;
}

/**
 * Replays the payment journal to find when the current №01 took the lead and
 * how many payments by others happened since. Ties keep the earlier leader,
 * same rule as the board. Falls back to the leader's createdAt when the
 * journal is empty or inconsistent.
 */
export function computeReign(events: WallEvent[], leaderSlug: string, leaderCreatedAt: number): Reign {
  const asc = events.slice().sort((a, b) => a.ts - b.ts);
  const totals = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let leader: string | null = null;
  let leadStart = leaderCreatedAt;

  for (const ev of asc) {
    totals.set(ev.slug, ev.newTotalUSD);
    if (!firstSeen.has(ev.slug)) firstSeen.set(ev.slug, ev.ts);
    // Recompute the leader after this payment.
    let best: string | null = null;
    for (const [slug, total] of totals) {
      if (best === null) { best = slug; continue; }
      const bt = totals.get(best) as number;
      if (total > bt || (total === bt && (firstSeen.get(slug) ?? 0) < (firstSeen.get(best) ?? 0))) best = slug;
    }
    if (best !== leader) {
      leader = best;
      leadStart = ev.ts;
    }
  }

  if (leader !== leaderSlug) return { since: leaderCreatedAt, challenges: 0 };
  const challenges = asc.filter((e) => e.ts >= leadStart && e.slug !== leaderSlug).length;
  return { since: leadStart, challenges };
}

/** "3 days" / "5 hours" / "just now" */
export function reignDuration(since: number, now = Date.now()): string {
  const h = Math.floor((now - since) / 3_600_000);
  if (h < 1) return "under an hour";
  if (h < 48) return h + (h === 1 ? " hour" : " hours");
  return Math.floor(h / 24) + " days";
}

/** "4 min ago" / "2 h ago" / "3 d ago" */
export function timeAgo(ts: number, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  if (h < 48) return h + " h ago";
  return Math.floor(h / 24) + " d ago";
}
