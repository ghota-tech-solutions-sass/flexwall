import { provenanceOf } from "@/rendering/provenance";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { formatHandle, stripHandlePrefix } from "@/domain/handle";
import { APP_LOCALE, DISPLAY_TIME_ZONE } from "@/domain/time";

/** X's prefilled post form. */
export const X_POST_INTENT_URL = "https://x.com/intent/post";

/** The avatar letter when a wall has neither a title nor a handle to take one from. */
const MONOGRAM_FALLBACK = "?";

/**
 * The name a wall goes by. New walls take their handle as a title, and a page
 * reading "@ada" twice looks unfinished: the handle line only shows when the
 * title says something else.
 */
export function wallIdentity(title: string, handle: string): { name: string; showHandle: boolean } {
  const name = title.trim();
  if (!name || stripHandlePrefix(name) === handle) return { name: formatHandle(handle), showHandle: false };
  return { name, showHandle: true };
}

/** The letter in the avatar: the first one of the name, never the "@". */
export function monogram(title: string, handle: string): string {
  return stripHandlePrefix(title.trim() || handle).charAt(0).toUpperCase() || MONOGRAM_FALLBACK;
}

/** "Joined September 2026". */
export function joinedLabel(createdAt: number): string {
  return `Joined ${new Date(createdAt).toLocaleDateString(APP_LOCALE, { month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE })}`;
}

/** Tiles whose numbers were read from the owner's own account. */
export function verifiedCount(states: Record<string, TileState>): number {
  return Object.values(states).filter((st) => st.status === "ready" && ["verified", "synced"].includes(provenanceOf(st.inputs)?.kind ?? "")).length;
}

/** A prefilled post on X. */
export function postOnX(url: string, text: string): string {
  return `${X_POST_INTENT_URL}?${new URLSearchParams({ text, url })}`;
}
