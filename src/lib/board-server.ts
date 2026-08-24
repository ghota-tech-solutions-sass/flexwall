import { listEntries, type PublicEntry } from "@/lib/store/entries";

export { MIN_ENTRY_USD, compactUSD, formatUSD, rankEntries, totalOnDisplay } from "@/lib/board";

/** Never throws at render time: an unavailable store renders an empty wall. */
export async function listEntriesSafe(): Promise<PublicEntry[]> {
  try {
    return await listEntries();
  } catch (error) {
    console.error("listEntries failed:", error);
    return [];
  }
}

