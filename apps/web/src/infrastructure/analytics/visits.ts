import { createHash } from "node:crypto";
import type { Db, Doc } from "../persistence/db";

type Counter = Doc & { count: number; firstAt: number; scope: string; recent?: Record<string, number> };
const COLLECTION = "visit_totals";
/** Shards avoid one hot document; bounded event receipts deduplicate retries without identifying visitors. */
export async function recordVisit(store: Db, eventId: string, officialWall: boolean, now = Date.now()): Promise<boolean> {
  const hash = createHash("sha256").update(eventId).digest("hex");
  const shard = parseInt(hash.slice(0, 2), 16) % 16;
  return store.transaction(async (tx) => {
    const site = await tx.get<Counter>(COLLECTION, `site-${shard}`);
    const wall = officialWall ? await tx.get<Counter>(COLLECTION, `wall-${shard}`) : null;
    if (site?.recent?.[hash] !== undefined) return false;
    const recent = Object.fromEntries(Object.entries(site?.recent ?? {}).filter(([, at]) => at > now - 1_800_000).sort((a, b) => a[1] - b[1]).slice(-511));
    recent[hash] = now;
    tx.set(COLLECTION, `site-${shard}`, { scope: "site", count: (site?.count ?? 0) + 1, firstAt: site?.firstAt ?? now, recent });
    if (officialWall) tx.set(COLLECTION, `wall-${shard}`, { scope: "wall", count: (wall?.count ?? 0) + 1, firstAt: wall?.firstAt ?? now });
    return true;
  });
}
export async function visitTotals(store: Db) {
  const counters = await store.where<Counter>(COLLECTION, [], 32);
  return {
    siteViews: counters.filter((c) => c.scope === "site").reduce((sum, c) => sum + c.count, 0),
    officialWallViews: counters.filter((c) => c.scope === "wall").reduce((sum, c) => sum + c.count, 0),
    trafficStartedAt: counters.length ? new Date(Math.min(...counters.map((c) => c.firstAt))).toISOString() : "",
  };
}
