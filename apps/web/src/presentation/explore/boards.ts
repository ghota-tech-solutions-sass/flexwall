import { currencySymbol, formatBand, formatNumber, VERIFIED_LEADERBOARDS, type Leaderboard } from "@flexwall/sdk";
import type { ExploreSort } from "@/application/use-cases/explore";
import { APP_LOCALE, DISPLAY_TIME_ZONE, HOURS_PER_DAY, MINUTE_MS, MINUTES_PER_HOUR } from "@/domain/time";

/** The sort that isn't a leaderboard: newest updates first. The Wall opens on it. */
export const RECENT_SORT = "recent" satisfies ExploreSort;

/** Boards that rank only numbers read from the owner's own account, and say so. */
export const VERIFIED_BOARDS = VERIFIED_LEADERBOARDS;

/** Revenue and wealth ranks are compared as reported and printed in dollars. */
const REVENUE_CURRENCY = "usd";

/** Past this many days, "updated" shows the date instead of a count. */
const RELATIVE_DAYS_MAX = 30;

/** The ways The Wall can be ordered, in the order the tabs show them. */
export const EXPLORE_SORTS: { id: ExploreSort; label: string; unit: string }[] = [
  { id: RECENT_SORT, label: "Recently updated", unit: "" },
  { id: "revenue", label: "Verified revenue", unit: "verified revenue" },
  { id: "wealth", label: "Verified wealth", unit: "verified wealth" },
  { id: "audience", label: "Audience", unit: "followers" },
  { id: "streak", label: "Commit streak", unit: "commit streak" },
  { id: "stars", label: "Stars", unit: "GitHub stars" },
];

export function exploreSort(raw: string | undefined): ExploreSort {
  return EXPLORE_SORTS.find((s) => s.id === raw)?.id ?? RECENT_SORT;
}

/** The leaderboard a sort ranks by, or null for the recent list. */
export function leaderboardOf(sort: ExploreSort): Leaderboard | null {
  return sort === RECENT_SORT ? null : sort;
}

/** A leaderboard value as a person reads it: "$12.4k", "$1M+", "412 days", "8,912". */
export function boardValue(board: Leaderboard, value: number): string {
  // The order says who has more; the value only says how many figures.
  if (board === "wealth") return formatBand({ value, unit: "currency", currency: REVENUE_CURRENCY });
  if (board === "revenue") return currencySymbol(REVENUE_CURRENCY) + formatNumber(value);
  if (board === "streak") return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
  return formatNumber(value);
}

/** "just now", "12 min ago", "3 h ago", "5 d ago", then the date. */
export function updatedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours} h ago`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < RELATIVE_DAYS_MAX) return `${days} d ago`;
  return new Date(at).toLocaleDateString(APP_LOCALE, { month: "short", day: "numeric", timeZone: DISPLAY_TIME_ZONE });
}
