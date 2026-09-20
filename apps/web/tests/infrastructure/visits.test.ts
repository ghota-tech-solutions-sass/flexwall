import { beforeEach, expect, test } from "bun:test";
import { db, resetMemoryDb } from "@/infrastructure/persistence/db";
import { recordVisit, visitTotals } from "@/infrastructure/analytics/visits";
import { visitTarget } from "@/presentation/visit-paths";

beforeEach(resetMemoryDb);
test("concurrent visits are atomic, retries deduplicated, wall views a subset of site views", async () => {
  const store = db();
  const events = Array.from({ length: 100 }, () => crypto.randomUUID());
  await Promise.all(events.flatMap((id, i) => [recordVisit(store, id, i % 2 === 0, 1000), recordVisit(store, id, i % 2 === 0, 1000)]));
  expect(await visitTotals(store)).toEqual({ siteViews: 100, officialWallViews: 50, trafficStartedAt: new Date(1000).toISOString() });
  const docs = await store.where("visit_totals", [], 100);
  expect(docs.length).toBeLessThanOrEqual(32);
  expect(JSON.stringify(docs)).not.toContain(events[0]);
  await recordVisit(store, events[1], true, 1001);
  expect((await visitTotals(store)).officialWallViews).toBe(50);
});
test("only public page shapes qualify; URLs, secrets and query strings never enter counters", () => {
  expect(visitTarget("/@flexwall")).toEqual({ kind: "wall", id: "flexwall" });
  expect(visitTarget("/u/flexwall")).toEqual({ kind: "wall", id: "flexwall" });
  for (const path of ["/edit", "/admin", "/login?token=secret", "https://flexwall.lol/", "/@flexwall/card.png", "/missing"]) expect(visitTarget(path)).toBeNull();
});
