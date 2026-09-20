import { expect, test } from "bun:test";
import { officialWall } from "@/domain/official-wall";
import { withOfficialStripe } from "@/domain/official-stripe-wall";
import { applyDraft } from "@/domain/wall";
import { entitlementsOf } from "@/domain/user";
import { catalog } from "@/plugins/registry";
import { validateOfficialStripe, OFFICIAL_STRIPE_ACCOUNT } from "@/infrastructure/billing/official-stripe";

test("adding official Stripe preserves all existing tiles and is idempotent", () => {
  const wall = officialWall("owner", "official", Date.now(), "nonce");
  const next = withOfficialStripe(wall);
  expect(next.tiles.slice(0, wall.tiles.length)).toEqual(wall.tiles);
  expect(next.tiles).toHaveLength(11);
  expect(withOfficialStripe(next)).toBe(next);
  const valid = applyDraft(wall, next, { catalog, entitlements: entitlementsOf({ lifetime: true, subscription: null }, Date.now()), connections: [] }, Date.now());
  expect(valid.tiles.at(-1)?.options.summary).toBe("sum");
});

test("official financial reporting refuses another account or unrelated products", () => {
  const account = { id: OFFICIAL_STRIPE_ACCOUNT };
  const products = { data: [{ name: "Flexwall Pro", metadata: { app: "flexwall" } }], has_more: false };
  expect(() => validateOfficialStripe(account, products)).not.toThrow();
  expect(() => validateOfficialStripe({ id: "acct_other" }, products)).toThrow();
  expect(() => validateOfficialStripe(account, { ...products, has_more: true })).toThrow();
  expect(() => validateOfficialStripe(account, { data: [{ name: "Another business" }], has_more: false })).toThrow();
});
