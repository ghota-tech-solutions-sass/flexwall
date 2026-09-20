import { db } from "../apps/web/src/infrastructure/persistence/db";
import { DbUsers, DbWalls } from "../apps/web/src/infrastructure/persistence/repositories";
import { withOfficialVisits } from "../apps/web/src/domain/official-visits-wall";
import { applyDraft, type Wall } from "../apps/web/src/domain/wall";
import { entitlementsOf, type User } from "../apps/web/src/domain/user";
import { catalog } from "../apps/web/src/plugins/registry";

if (process.env.GOOGLE_PROJECT_ID !== "ghota-outflex-prod") throw new Error("Production only.");
const response = await fetch("https://flexwall.lol/api/public-stats");
const stats = await response.json();
if (!response.ok || !Number.isSafeInteger(stats.siteViews) || !Number.isSafeInteger(stats.officialWallViews)) throw new Error("Traffic reporting is not ready; wall unchanged.");
const store = db();
const owner = await new DbUsers(store).byEmail("contact@ghotatechsolutions.com");
if (!owner || owner.handle !== "flexwall") throw new Error("Official owner not found.");
const original = await new DbWalls(store).byOwner(owner.id);
if (!original || original.handle !== "flexwall") throw new Error("Official wall not found.");
await store.transaction(async (tx) => {
  const currentOwner = await tx.get("users", owner.id) as unknown as User | null;
  const currentWall = await tx.get("walls", original.id) as unknown as Wall | null;
  if (!currentOwner || !currentWall || currentOwner.handle !== "flexwall" || currentWall.ownerId !== owner.id) throw new Error("Official ownership changed; nothing written.");
  const now = Date.now();
  const draft = withOfficialVisits(currentWall);
  const wall = applyDraft(currentWall, draft, { catalog, entitlements: entitlementsOf(currentOwner, now), connections: [] }, now);
  tx.set("walls", original.id, wall as unknown as Record<string, unknown>);
});
console.log("Page-view counters added to https://flexwall.lol/@flexwall. Existing tiles preserved.");
