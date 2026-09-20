import { randomUUID } from "node:crypto";
import { db } from "../apps/web/src/infrastructure/persistence/db";
import { DbUsers } from "../apps/web/src/infrastructure/persistence/repositories";
import { officialWall } from "../apps/web/src/domain/official-wall";
import { applyDraft } from "../apps/web/src/domain/wall";
import { entitlementsOf, type User } from "../apps/web/src/domain/user";
import { catalog } from "../apps/web/src/plugins/registry";

const email = process.env.OFFICIAL_WALL_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("OFFICIAL_WALL_EMAIL must be a valid owner email.");
if (process.env.GOOGLE_PROJECT_ID !== "ghota-outflex-prod") throw new Error("This command is only for Flexwall production.");
const store = db();
const existing = await new DbUsers(store).byEmail(email);
if (existing?.handle && existing.handle !== "flexwall") throw new Error("This account already has a different wall. Use a dedicated owner email; no existing wall was changed.");
const now = Date.now();
const owner: User = existing ?? { id: randomUUID(), email, handle: null, timeZone: "Europe/Paris", createdAt: now, stripeCustomerId: null, subscription: null, lifetime: false, referredBy: null, bonusProUntil: null };
const proposed = officialWall(owner.id, "flexwall-official", now, randomUUID());
const wall = applyDraft(proposed, proposed, { catalog, entitlements: entitlementsOf(owner, now), connections: [] }, now);
const result = await store.transaction(async (tx) => {
  const claimed = await tx.get("handles", "flexwall");
  const current = await tx.get("walls", wall.id);
  const currentOwner = await tx.get("users", owner.id);
  if (claimed || current) {
    if (claimed?.userId === owner.id && current?.ownerId === owner.id) return "already exists; left unchanged";
    throw new Error("Official handle or wall is already owned. No data was changed.");
  }
  if (currentOwner?.handle && currentOwner.handle !== "flexwall") throw new Error("Owner acquired another handle. No data was changed.");
  tx.set("users", owner.id, { ...(currentOwner ?? owner), handle: "flexwall" });
  tx.set("handles", "flexwall", { handle: "flexwall", userId: owner.id });
  tx.set("walls", wall.id, wall as unknown as Record<string, unknown>);
  return "created and published";
});
console.log(`Official wall ${result}: https://flexwall.lol/@flexwall`);
