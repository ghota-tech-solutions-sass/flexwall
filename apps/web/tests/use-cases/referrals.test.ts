import { describe, expect, test } from "bun:test";
import { SignIn } from "@/application/use-cases/auth";
import { ApplyBillingEvent, StartCheckout } from "@/application/use-cases/billing";
import { GetReferralProgram } from "@/application/use-cases/referrals";
import type { BillingEvent } from "@/application/ports";
import { REFERRAL_REWARD_CAP } from "@/domain/referral";
import type { Subscription } from "@/domain/user";
import { aReferral, aSubscription, aUser, NOW } from "../builders";
import { FakeLinks, FakePayments, FakeTokens, FixedClock, InMemoryEventLog, InMemoryHandles, InMemoryReferrals, InMemoryUsers, SequentialIds } from "../fakes";

const DAY = 86_400_000;

function world() {
  const users = new InMemoryUsers();
  const handles = new InMemoryHandles();
  const referrals = new InMemoryReferrals();
  const clock = new FixedClock();
  const payments = new FakePayments();
  return {
    users,
    handles,
    referrals,
    clock,
    payments,
    signIn: new SignIn({ tokens: new FakeTokens(), users, handles, referrals, ids: new SequentialIds(), clock }),
    checkout: new StartCheckout({ users, referrals, payments, clock, links: new FakeLinks() }),
    apply: new ApplyBillingEvent({ users, events: new InMemoryEventLog(), referrals, clock }),
    program: new GetReferralProgram({ users, referrals, clock, links: new FakeLinks() }),
  };
}

async function withReferrer(w: ReturnType<typeof world>) {
  await w.users.save(aUser().withId("ada").withEmail("ada@example.com").withHandle("ada").build());
  await w.handles.claim("ada" as never, "ada");
}

async function withInvitee(w: ReturnType<typeof world>, id = "bob") {
  await w.users.save(aUser().withId(id).withEmail(`${id}@example.com`).withHandle(id).withStripeCustomer(`cus_${id}`).referredBy("ada").build());
  await w.referrals.save(aReferral().from("ada").to(id).build());
}

const subscriptionEvent = (eventId: string, status: Subscription["status"] = "active"): BillingEvent => ({
  id: eventId,
  type: "subscription",
    role: "pro" as const,
  customerId: "cus_bob",
  userId: null,
  subscription: aSubscription().with({ status }).build(),
});
const activeSubscription = (eventId: string) => subscriptionEvent(eventId);

describe("Signing up through an invite", () => {
  test("given an invite link from @ada, when a new account signs in, then it's recorded as Ada's invitee", async () => {
    // Given
    const w = world();
    await withReferrer(w);

    // When
    const { user } = await w.signIn.execute({ token: "magic:bob@example.com", referralHandle: "ada" });

    // Then
    expect(user.referredBy).toBe("ada");
    expect(await w.referrals.byReferee(user.id)).toMatchObject({ referrerId: "ada", status: "signed_up" });
  });

  test("given Ada's link, when an account with her address in another case signs up, then it isn't her invitee", async () => {
    // Given
    const w = world();
    await w.users.save(aUser().withId("ada").withEmail("ADA@example.com").withHandle("ada").build());
    await w.handles.claim("ada" as never, "ada");

    // When
    const { user, isNew } = await w.signIn.execute({ token: "magic:ada@example.com", referralHandle: "ada" });

    // Then
    expect(isNew).toBe(true);
    expect(user.referredBy).toBeNull();
    expect(w.referrals.items.size).toBe(0);
  });

  test("given a link to a handle nobody owns, when a new account signs in, then it's created without a referral", async () => {
    // Given
    const w = world();

    // When
    const { user, isNew } = await w.signIn.execute({ token: "magic:bob@example.com", referralHandle: "ghost" });

    // Then
    expect(isNew).toBe(true);
    expect(user.referredBy).toBeNull();
    expect(w.referrals.items.size).toBe(0);
  });

  test("given an existing account, when it signs in through an invite link, then it isn't turned into an invitee", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await w.users.save(aUser().withId("bob").withEmail("bob@example.com").withHandle("bob").build());

    // When
    const { user } = await w.signIn.execute({ token: "magic:bob@example.com", referralHandle: "ada" });

    // Then
    expect(user.referredBy).toBeNull();
    expect(w.referrals.items.size).toBe(0);
  });
});

describe("The invitee discount", () => {
  test("given an invitee who hasn't paid, when they check out, then the discount applies", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);

    // When
    await w.checkout.execute({ userId: "bob", plan: "yearly", acceptedTerms: true });

    // Then
    expect(w.payments.checkouts[0].referralDiscount).toBe(true);
  });

  test("given an invitee whose first payment already converted, when they buy again, then there's no discount", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);
    await w.referrals.save(aReferral().from("ada").to("bob").converted(NOW).build());

    // When
    await w.checkout.execute({ userId: "bob", plan: "yearly", acceptedTerms: true });

    // Then
    expect(w.payments.checkouts[0].referralDiscount).toBe(false);
  });

  test("given a user on a free month earned from referrals, when they subscribe, then checkout opens", async () => {
    // Given
    const w = world();
    await w.users.save(aUser().withId("ada").withBonusProUntil(NOW + 20 * DAY).build());

    // When
    const { url } = await w.checkout.execute({ userId: "ada", plan: "monthly", acceptedTerms: true });

    // Then
    expect(url).toBe("https://pay.test/monthly");
  });
});

describe("Rewarding the referrer", () => {
  test("given Ada's invitee, when their subscription becomes active, then the referral converts and Ada gets a month of Pro", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);

    // When
    await w.apply.execute(activeSubscription("evt_1"));

    // Then
    expect(await w.referrals.byReferee("bob")).toMatchObject({ status: "converted", rewarded: true, convertedAt: NOW });
    expect((await w.users.byId("ada"))!.bonusProUntil).toBe(NOW + 30 * DAY);
  });

  test("given a converted invitee, when their renewal events arrive, then Ada isn't rewarded again", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);
    await w.apply.execute(activeSubscription("evt_1"));

    // When
    await w.apply.execute(activeSubscription("evt_renewal"));
    await w.apply.execute(activeSubscription("evt_1"));

    // Then
    expect((await w.users.byId("ada"))!.bonusProUntil).toBe(NOW + 30 * DAY);
  });

  test("given an invitee whose checkout is still incomplete, when that event arrives, then nothing is rewarded yet", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);

    // When
    await w.apply.execute(subscriptionEvent("evt_1", "incomplete"));

    // Then
    expect((await w.referrals.byReferee("bob"))!.status).toBe("signed_up");
    expect((await w.users.byId("ada"))!.bonusProUntil).toBeNull();
  });

  test("given an invitee buying lifetime, when the payment lands, then Ada gets her month", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);

    // When
    await w.apply.execute({ id: "evt_l", type: "lifetime", customerId: "cus_bob", userId: "bob" });

    // Then
    expect((await w.users.byId("ada"))!.bonusProUntil).toBe(NOW + 30 * DAY);
  });

  test("given Ada already rewarded for twelve invitees, when a thirteenth pays, then it converts without more Pro time", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    for (let i = 0; i < REFERRAL_REWARD_CAP; i++) await w.referrals.save(aReferral().from("ada").to(`old${i}`).converted(NOW - DAY).build());
    await withInvitee(w);

    // When
    await w.apply.execute(activeSubscription("evt_1"));

    // Then
    expect(await w.referrals.byReferee("bob")).toMatchObject({ status: "converted", rewarded: false });
    expect((await w.users.byId("ada"))!.bonusProUntil).toBeNull();
  });

  test("given a rewarded conversion, when the invitee is refunded within 14 days, then Ada's month is taken back", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);
    await w.apply.execute(activeSubscription("evt_1"));
    w.clock.advance(3 * DAY);

    // When
    await w.apply.execute({ id: "evt_refund", type: "refund", role: "pro" as const, customerId: "cus_bob" });

    // Then
    expect(await w.referrals.byReferee("bob")).toMatchObject({ status: "refunded", rewarded: false });
    expect((await w.users.byId("ada"))!.bonusProUntil).toBeNull();
  });

  test("given a rewarded conversion, when a refund comes after 14 days, then Ada keeps her month", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);
    await w.apply.execute(activeSubscription("evt_1"));
    w.clock.advance(20 * DAY);

    // When
    await w.apply.execute({ id: "evt_refund", type: "refund", role: "pro" as const, customerId: "cus_bob" });

    // Then
    expect((await w.referrals.byReferee("bob"))!.status).toBe("converted");
    expect((await w.users.byId("ada"))!.bonusProUntil).toBe(NOW + 30 * DAY);
  });
});

describe("GetReferralProgram", () => {
  test("given Ada with a paying invitee, when her program is read, then it shows her link and what she earned", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);
    await w.apply.execute(activeSubscription("evt_1"));

    // When
    const program = await w.program.execute({ userId: "ada" });

    // Then
    expect(program).toEqual({
      link: "https://flexwall.test/r/ada",
      summary: { signedUp: 1, converted: 1, daysEarned: 30, proUntil: NOW + 30 * DAY },
      invitedBy: null,
    });
  });

  test("given an invitee who hasn't paid, when their program is read, then it names who invited them", async () => {
    // Given
    const w = world();
    await withReferrer(w);
    await withInvitee(w);

    // When
    const program = await w.program.execute({ userId: "bob" });

    // Then
    expect(program?.invitedBy).toBe("ada");
  });
});
