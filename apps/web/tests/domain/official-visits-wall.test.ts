import { expect, test } from "bun:test";
import { officialWall } from "@/domain/official-wall";
import { withOfficialStripe } from "@/domain/official-stripe-wall";
import { withOfficialVisits } from "@/domain/official-visits-wall";
import { applyDraft } from "@/domain/wall";
import { entitlementsOf } from "@/domain/user";
import { catalog } from "@/plugins/registry";
test("traffic counters preserve the complete official wall and remain valid and idempotent", () => {
  const wall = withOfficialStripe(officialWall("owner", "official", Date.now(), "nonce"));
  const next = withOfficialVisits(wall);
  expect(next.tiles.slice(0, 11)).toEqual(wall.tiles);
  expect(next.tiles).toHaveLength(13);
  expect(withOfficialVisits(next)).toBe(next);
  expect(applyDraft(wall, next, { catalog, entitlements: entitlementsOf({ lifetime: true, subscription: null }, Date.now()), connections: [] }, Date.now()).tiles).toHaveLength(13);
});
