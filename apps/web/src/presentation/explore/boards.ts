import { formatNumber, type Leaderboard } from "@flexwall/sdk";
import type { ExploreSort } from "@/application/use-cases/explore";

/** The ways The Wall can be ordered, in the order the tabs show them. */
export const EXPLORE_SORTS: { id: ExploreSort; label: string; unit: string }[] = [
  { id: "recent", label: "Recently updated", unit: "" },
  { id: "revenue", label: "Verified revenue", unit: "verified revenue" },
  { id: "audience", label: "Audience", unit: "followers" },
  { id: "streak", label: "Commit streak", unit: "commit streak" },
  { id: "stars", label: "Stars", unit: "GitHub stars" },
];

export function exploreSort(raw: string | undefined): ExploreSort {
  return EXPLORE_SORTS.find((s) => s.id === raw)?.id ?? "recent";
}

/** A leaderboard value as a person reads it: "$12.4k", "412 days", "8,912". */
export function boardValue(board: Leaderboard, value: number): string {
  if (board === "revenue") return "$" + formatNumber(value);
  if (board === "streak") return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
  return formatNumber(value);
}

/** "just now", "12 min ago", "3 h ago", "5 d ago", then the date. */
export function updatedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
