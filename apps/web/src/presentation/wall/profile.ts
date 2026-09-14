import type { TileState } from "@/application/use-cases/resolve-wall";

/**
 * The name a wall goes by. New walls take their handle as a title, and a page
 * reading "@ada" twice looks unfinished: the handle line only shows when the
 * title says something else.
 */
export function wallIdentity(title: string, handle: string): { name: string; showHandle: boolean } {
  const name = title.trim();
  if (!name || name.replace(/^@/, "") === handle) return { name: `@${handle}`, showHandle: false };
  return { name, showHandle: true };
}

/** The letter in the avatar: the first one of the name, never the "@". */
export function monogram(title: string, handle: string): string {
  return (title.trim() || handle).replace(/^@/, "").charAt(0).toUpperCase() || "?";
}

/** "Joined September 2026". */
export function joinedLabel(createdAt: number): string {
  return `Joined ${new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** Tiles whose numbers were read from the owner's own account. */
export function verifiedCount(states: Record<string, TileState>): number {
  return Object.values(states).filter((st) => st.status === "ready" && Object.values(st.inputs).some((i) => i.source?.verified)).length;
}

/** A prefilled post on X. */
export function postOnX(url: string, text: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}
