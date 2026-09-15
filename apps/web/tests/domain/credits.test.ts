import { describe, expect, test } from "bun:test";
import { centsPerCredit, creditDay, CREDIT_PACK_DETAILS, CREDIT_PACKS, daysLeft, isCreditPack } from "@/domain/credits";

/** What one credit can cost Flexwall at worst: one X profile read. */
const WORST_READ_COST_USD = 0.01;
/** The highest VAT rate in the EU (Hungary), taken out of a tax-included price. */
const HIGHEST_VAT = 0.27;
/** A non-EEA card with currency conversion: 3.25% + 2% + €0.25 (about $0.30). */
const WORST_CARD_FEE = (price: number) => price * 0.0525 + 0.3;

describe("Credits", () => {
  test("given what a checkout request can carry, when it's read as a pack, then only the packs Flexwall sells are accepted", () => {
    // Given
    const asked: unknown[] = [...CREDIT_PACKS, "huge", "STARTER", undefined, 100];

    // When
    const accepted = asked.filter(isCreditPack);

    // Then
    expect(accepted).toEqual(["starter", "regular", "large"]);
  });

  test("given every pack, when all its credits are spent at the worst tax and card rates, then it still covers the reads", () => {
    // Given
    const packs = CREDIT_PACKS.map((p) => CREDIT_PACK_DETAILS[p]);

    // When
    const margins = packs.map(({ credits, priceUsd }) => priceUsd / (1 + HIGHEST_VAT) - WORST_CARD_FEE(priceUsd) - credits * WORST_READ_COST_USD);

    // Then
    expect(margins.every((m) => m > 0)).toBe(true);
  });

  test("given bigger packs, when compared per credit, then each one is cheaper than the one before", () => {
    // Given / When
    const cents = CREDIT_PACKS.map(centsPerCredit);

    // Then
    expect(cents).toEqual([4, 3, 2.5]);
  });

  test("given a moment late in the evening west of UTC, when its credit day is taken, then it's already the next UTC day", () => {
    // Given
    const newYorkElevenPm = Date.UTC(2026, 8, 16, 3, 0, 0);

    // When
    const day = creditDay(newYorkElevenPm);

    // Then
    expect(day).toBe("2026-09-16");
  });

  test("given a balance, when the days it lasts are counted, then partial days don't count and nothing spending means no end", () => {
    // Given / When / Then
    expect(daysLeft(100, 3)).toBe(33);
    expect(daysLeft(0, 1)).toBe(0);
    expect(daysLeft(50, 0)).toBeNull();
  });
});
