import { describe, expect, test } from "bun:test";
import { ApplyBillingEvent, OpenBillingPortal, StartCheckout, StartCreditsCheckout } from "@/application/use-cases/billing";
import { CREDIT_PACK_DETAILS } from "@/domain/credits";
import type { BillingEvent } from "@/application/ports";
import { TERMS_VERSION } from "@/domain/publisher";
import { planOf } from "@/domain/user";
import { aSubscription, aUser, NOW } from "../builders";
import { FakeLinks, FakePayments, FixedClock, InMemoryCredits, InMemoryEventLog, InMemoryReferrals, InMemoryUsers } from "../fakes";

describe("StartCheckout", () => {
  test("given a free user, when they pick yearly, then they're sent to checkout and remembered as a customer", async () => {
    // Given
    const users = new InMemoryUsers();
    const payments = new FakePayments();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCheckout({ users, referrals: new InMemoryReferrals(), payments, clock: new FixedClock(), links: new FakeLinks() });

    // When
    const { url } = await checkout.execute({ userId: "u1", plan: "yearly", acceptedTerms: true });

    // Then
    expect(url).toBe("https://pay.test/yearly");
    expect(payments.checkouts).toEqual([{ userId: "u1", plan: "yearly", consent: { termsVersion: TERMS_VERSION, acceptedAt: NOW }, referralDiscount: false }]);
    expect((await users.byId("u1"))!.stripeCustomerId).toBe("cus_u1");
  });

  test("given a buyer who hasn't accepted the terms, when they upgrade, then checkout doesn't open", async () => {
    // Given
    const users = new InMemoryUsers();
    const payments = new FakePayments();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCheckout({ users, referrals: new InMemoryReferrals(), payments, clock: new FixedClock(), links: new FakeLinks() });

    // When
    const attempt = checkout.execute({ userId: "u1", plan: "monthly", acceptedTerms: false });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect(payments.checkouts).toEqual([]);
  });

  test("given a Pro subscriber, when they try to subscribe again, then they're sent to billing instead", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").pro().build());
    const checkout = new StartCheckout({ users, referrals: new InMemoryReferrals(), payments: new FakePayments(), clock: new FixedClock(), links: new FakeLinks() });

    // When
    const attempt = checkout.execute({ userId: "u1", plan: "monthly", acceptedTerms: true });

    // Then
    await expect(attempt).rejects.toThrow("You're already Pro.");
  });

  test("given payments switched off, when someone upgrades, then they're told plainly", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCheckout({ users, referrals: new InMemoryReferrals(), payments: new FakePayments(false), clock: new FixedClock(), links: new FakeLinks() });

    // When
    const attempt = checkout.execute({ userId: "u1", plan: "lifetime", acceptedTerms: true });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "payments_unavailable" });
  });
});

describe("StartCreditsCheckout", () => {
  test("given a free user who accepted the terms, when they buy a pack, then checkout opens for that pack with their consent", async () => {
    // Given
    const users = new InMemoryUsers();
    const payments = new FakePayments();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCreditsCheckout({ users, payments, clock: new FixedClock(), links: new FakeLinks() });

    // When
    const { url } = await checkout.execute({ userId: "u1", pack: "regular", acceptedTerms: true });

    // Then
    expect(url).toBe("https://pay.test/credits/regular");
    expect(payments.creditCheckouts).toEqual([{ userId: "u1", pack: "regular", consent: { termsVersion: TERMS_VERSION, acceptedAt: NOW } }]);
    expect((await users.byId("u1"))!.stripeCustomerId).toBe("cus_u1");
  });

  test("given a Lifetime owner, when they buy credits, then checkout opens: credits aren't part of any plan", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").lifetime().build());
    const checkout = new StartCreditsCheckout({ users, payments: new FakePayments(), clock: new FixedClock(), links: new FakeLinks() });

    // When
    const { url } = await checkout.execute({ userId: "u1", pack: "starter", acceptedTerms: true });

    // Then
    expect(url).toBe("https://pay.test/credits/starter");
  });

  test("given a buyer who hasn't accepted the terms, when they buy credits, then checkout doesn't open", async () => {
    // Given
    const users = new InMemoryUsers();
    const payments = new FakePayments();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCreditsCheckout({ users, payments, clock: new FixedClock(), links: new FakeLinks() });

    // When
    const attempt = checkout.execute({ userId: "u1", pack: "starter", acceptedTerms: false });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect(payments.creditCheckouts).toEqual([]);
  });
});

describe("OpenBillingPortal", () => {
  test("given no billing history, when the portal is requested, then there's nothing to open", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").build());

    // When
    const attempt = new OpenBillingPortal({ users, payments: new FakePayments(), links: new FakeLinks() }).execute({ userId: "u1" });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("ApplyBillingEvent", () => {
  const subscriptionEvent = (id: string, over: Parameters<ReturnType<typeof aSubscription>["with"]>[0]): BillingEvent => ({
    id,
    type: "subscription",
    customerId: "cus_1",
    userId: null,
    subscription: aSubscription().with(over).build(),
  });

  async function setup() {
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").withStripeCustomer("cus_1").build());
    const credits = new InMemoryCredits();
    return { users, credits, apply: new ApplyBillingEvent({ users, events: new InMemoryEventLog(), referrals: new InMemoryReferrals(), credits, clock: new FixedClock() }) };
  }

  test("given a paid credit pack, when its event is applied twice, then the pack's credits are added once", async () => {
    // Given
    const { credits, apply } = await setup();
    const event: BillingEvent = { id: "evt_c", type: "credits", customerId: "cus_1", userId: "u1", pack: "regular", credits: 400 };

    // When
    const first = await apply.execute(event);
    const replay = await apply.execute(event);

    // Then
    expect([first, replay]).toEqual(["applied", "duplicate"]);
    expect(await credits.balance("u1")).toBe(CREDIT_PACK_DETAILS.regular.credits);
    expect((await credits.history("u1", 5)).map((e) => [e.reason, e.amount, e.detail])).toEqual([["purchase", 400, "regular"]]);
  });

  test("given a pack partly spent, when its payment is refunded in full, then its credits leave the balance down to zero", async () => {
    // Given
    const { credits, apply } = await setup();
    await apply.execute({ id: "evt_c", type: "credits", customerId: "cus_1", userId: "u1", pack: "starter", credits: 100 });
    await credits.spend({ userId: "u1", key: "conn-1", day: "2026-09-14", amount: 1, detail: "@ada" });

    // When
    await apply.execute({ id: "evt_r", type: "credits_refund", customerId: "cus_1", userId: "u1", pack: "starter" });

    // Then
    expect(await credits.balance("u1")).toBe(0);
  });

  test("given a credit pack bought on a Pro account, when applied, then the plan is left alone", async () => {
    // Given
    const { users, apply } = await setup();
    await apply.execute(subscriptionEvent("evt_1", { status: "active" }));

    // When
    await apply.execute({ id: "evt_c", type: "credits", customerId: "cus_1", userId: "u1", pack: "starter", credits: 100 });

    // Then
    expect(planOf((await users.byId("u1"))!, NOW)).toBe("pro");
  });

  test("given an active subscription event, when applied, then the customer becomes Pro", async () => {
    // Given
    const { users, apply } = await setup();

    // When
    const result = await apply.execute(subscriptionEvent("evt_1", { status: "active" }));

    // Then
    expect(result).toBe("applied");
    expect(planOf((await users.byId("u1"))!, NOW)).toBe("pro");
  });

  test("given the same event delivered twice, when applied, then the replay changes nothing", async () => {
    // Given
    const { users, apply } = await setup();
    await apply.execute(subscriptionEvent("evt_1", { status: "active" }));
    await apply.execute(subscriptionEvent("evt_2", { status: "canceled" }));

    // When
    const replay = await apply.execute(subscriptionEvent("evt_1", { status: "active" }));

    // Then
    expect(replay).toBe("duplicate");
    expect(planOf((await users.byId("u1"))!, NOW)).toBe("free");
  });

  test("given an older period arriving after a newer one, when applied, then the newer state is kept", async () => {
    // Given
    const { users, apply } = await setup();
    await apply.execute(subscriptionEvent("evt_new", { status: "active", currentPeriodEnd: NOW + 60 * 86_400_000 }));

    // When
    await apply.execute(subscriptionEvent("evt_old", { status: "incomplete", currentPeriodEnd: NOW + 30 * 86_400_000 }));

    // Then
    expect((await users.byId("u1"))!.subscription!.status).toBe("active");
  });

  test("given a lifetime purchase, when applied, then the user keeps Pro whatever happens to subscriptions", async () => {
    // Given
    const { users, apply } = await setup();

    // When
    await apply.execute({ id: "evt_l", type: "lifetime", customerId: "cus_1", userId: "u1" });
    await apply.execute(subscriptionEvent("evt_c", { status: "canceled" }));

    // Then
    expect(planOf((await users.byId("u1"))!, NOW)).toBe("lifetime");
  });
});
