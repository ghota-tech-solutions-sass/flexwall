import { expect, test } from "bun:test";
import { officialWall } from "@/domain/official-wall";
import { applyDraft } from "@/domain/wall";
import { entitlementsOf } from "@/domain/user";
import { catalog } from "@/plugins/registry";

test("the official wall fits a free account and uses live sources for every numeric tile", () => {
  const wall = officialWall("owner", "official", Date.now(), "nonce");
  const validated = applyDraft(wall, wall, { catalog, entitlements: entitlementsOf({ lifetime: false, subscription: null }, Date.now()), connections: [] }, Date.now());
  expect(validated.published).toBe(true);
  expect(validated.listed).toBe(true);
  expect(validated.tiles).toHaveLength(8);
  for (const tile of validated.tiles) {
    for (const binding of Object.values(tile.inputs)) {
      expect(binding.kind).toBe("metric");
      if (binding.kind === "metric") expect(["flexwall", "github"]).toContain(binding.connector);
    }
  }
});
