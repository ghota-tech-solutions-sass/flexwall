import { describe, expect, test } from "bun:test";
import { canRefer, convert, grantMonth, REFERRAL_REWARD_CAP, refundable, summarize, takeMonthBack } from "@/domain/referral";
import { paidPlanOf, planOf } from "@/domain/user";
import { aReferral, aUser, NOW } from "../builders";

const DAY = 86_400_000;

describe("Referral rules", () => {
  test("given two accounts with the same address in different case, when one invites the other, then it's refused", () => {
    // Given
    const referrer = aUser().withId("u1").withEmail("Ada@Example.com").build();
    const referee = aUser().withId("u2").withEmail("ada@example.com").build();

    // When
    const allowed = canRefer(referrer, referee);

    // Then
    expect(allowed).toBe(false);
  });

  test("given Pro time left, when a month is granted, then it starts after the time left", () => {
    // Given
    const referrer = aUser().withBonusProUntil(NOW + 10 * DAY).build();

    // When
    const rewarded = grantMonth(referrer, NOW);

    // Then
    expect(rewarded.bonusProUntil).toBe(NOW + 40 * DAY);
  });

  test("given Pro time that already ran out, when a month is granted, then it starts now", () => {
    // Given
    const referrer = aUser().withBonusProUntil(NOW - 5 * DAY).build();

    // When
    const rewarded = grantMonth(referrer, NOW);

    // Then
    expect(rewarded.bonusProUntil).toBe(NOW + 30 * DAY);
  });

  test("given a referrer at the cap, when another invitee pays, then the referral converts without a reward", () => {
    // Given
    const referral = aReferral().build();

    // When
    const converted = convert(referral, REFERRAL_REWARD_CAP, NOW);

    // Then
    expect(converted.status).toBe("converted");
    expect(converted.rewarded).toBe(false);
  });

  test("given a conversion, when a refund comes within 14 days and later, then only the first undoes it", () => {
    // Given
    const referral = aReferral().converted(NOW).build();

    // When
    const soon = refundable(referral, NOW + 13 * DAY);
    const late = refundable(referral, NOW + 15 * DAY);

    // Then
    expect(soon).toBe(true);
    expect(late).toBe(false);
  });

  test("given a month being taken back, when less than a month was left, then no Pro time remains", () => {
    // Given
    const referrer = aUser().withBonusProUntil(NOW + 20 * DAY).build();

    // When
    const after = takeMonthBack(referrer, NOW);

    // Then
    expect(after.bonusProUntil).toBeNull();
  });

  test("given referral Pro time, when plans are read, then the plan is Pro but nothing is paid for", () => {
    // Given
    const user = aUser().withBonusProUntil(NOW + DAY).build();

    // When
    const plan = planOf(user, NOW);
    const paid = paidPlanOf(user, NOW);

    // Then
    expect(plan).toBe("pro");
    expect(paid).toBe("free");
  });

  test("given invitees at every stage, when summarized, then only rewarded conversions count as days earned", () => {
    // Given
    const referrals = [aReferral().to("a").build(), aReferral().to("b").converted(NOW, true).build(), aReferral().to("c").converted(NOW, false).build(), aReferral().to("d").withStatus("refunded").build()];
    const referrer = aUser().withBonusProUntil(NOW + 30 * DAY).build();

    // When
    const summary = summarize(referrals, referrer, NOW);

    // Then
    expect(summary).toEqual({ signedUp: 4, converted: 2, daysEarned: 30, proUntil: NOW + 30 * DAY });
  });
});
