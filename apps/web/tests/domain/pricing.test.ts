import { describe, expect, test } from "bun:test";
import { BILLING_PLANS, isBillingPlan } from "@/domain/pricing";

describe("Pricing", () => {
  test("given what a checkout request can carry, when it's read as a plan, then only the plans Flexwall sells are accepted", () => {
    // Given
    const asked: unknown[] = [...BILLING_PLANS, "free", "MONTHLY", undefined, 6];

    // When
    const accepted = asked.filter(isBillingPlan);

    // Then
    expect(accepted).toEqual(["monthly", "yearly", "lifetime"]);
  });
});
