import { db } from "../apps/web/src/infrastructure/persistence/db";
import { DbUsers, DbWalls } from "../apps/web/src/infrastructure/persistence/repositories";
import { withOfficialStripe } from "../apps/web/src/domain/official-stripe-wall";
import { applyDraft, type Wall } from "../apps/web/src/domain/wall";
import { entitlementsOf, type User } from "../apps/web/src/domain/user";
import { catalog } from "../apps/web/src/plugins/registry";

if (process.env.GOOGLE_PROJECT_ID !== "ghota-outflex-prod") throw new Error("Production only.");
const response = await fetch("https://flexwall.lol/api/public-stats/stripe");
if (!response.ok || (await response.json()).mode !== "live") throw new Error("Live Stripe reporting is not ready; wall unchanged.");
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
  // The official showcase needs eleven tiles. This internal complimentary plan never calls Stripe or charges the owner.
  const updatedOwner: User = { ...currentOwner, complimentary: currentOwner.complimentary ?? { until: null, grantedAt: now, grantedBy: "contact@ghotatechsolutions.com", note: "Official Flexwall showcase: extra tiles for live Stripe statistics." } };
  const draft = withOfficialStripe(currentWall);
  const wall = applyDraft(currentWall, draft, { catalog, entitlements: entitlementsOf(updatedOwner, now), connections: [] }, now);
  tx.set("users", owner.id, updatedOwner as unknown as Record<string, unknown>);
  tx.set("walls", original.id, wall as unknown as Record<string, unknown>);
});
console.log("Live Stripe widgets added to https://flexwall.lol/@flexwall. Existing tiles preserved; no payment created.");
