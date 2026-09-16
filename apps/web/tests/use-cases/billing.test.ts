import { describe, expect, test } from "bun:test";
import { ApplyBillingEvent, OpenBillingPortal, StartCheckout } from "@/application/use-cases/billing";
import type { BillingEvent } from "@/application/ports";
import { TERMS_VERSION } from "@/domain/publisher";
import { planOf } from "@/domain/user";
import { aSubscription, aUser, NOW } from "../builders";
import { FakeLinks, FakePayments, FixedClock, InMemoryEventLog, InMemoryReferrals, InMemoryUsers } from "../fakes";

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
  const subscriptionEvent = (id: string, over: Parameters<ReturnType<typeof aSubscription>["with"]>[0], role: "pro" | "paid_accounts" = "pro"): BillingEvent => ({
    id,
    type: "subscription",
    role,
    customerId: "cus_1",
    userId: null,
    subscription: aSubscription().with(over).build(),
  });

  async function setup() {
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").withStripeCustomer("cus_1").build());
    return { users, apply: new ApplyBillingEvent({ users, events: new InMemoryEventLog(), referrals: new InMemoryReferrals(), clock: new FixedClock() }) };
  }

  test("given an accounts subscription event, when applied, then it's stored beside the plan and changes neither", async () => {
    // Given
    const { users, apply } = await setup();
    await apply.execute(subscriptionEvent("evt_pro", { status: "active" }));

    // When
    await apply.execute(subscriptionEvent("evt_accounts", { id: "sub_accounts", status: "active", quantity: 3 }, "paid_accounts"));

    // Then
    const user = (await users.byId("u1"))!;
    expect(user.subscription?.id).toBe("sub_1");
    expect(user.paidAccounts).toMatchObject({ id: "sub_accounts", quantity: 3 });
    expect(planOf(user, NOW)).toBe("pro");
  });

  test("given an owner on nothing but accounts, when the event is applied, then they're still on the free plan", async () => {
    // Given
    const { users, apply } = await setup();

    // When
    await apply.execute(subscriptionEvent("evt_accounts", { id: "sub_accounts", status: "active", quantity: 2 }, "paid_accounts"));

    // Then
    expect(planOf((await users.byId("u1"))!, NOW)).toBe("free");
  });

  test("given a quantity raised then an older event arriving late, when both are applied, then the newer state stays", async () => {
    // Given
    const { users, apply } = await setup();
    await apply.execute(subscriptionEvent("evt_new", { id: "sub_accounts", status: "active", quantity: 3, updatedAt: NOW + 1000 }, "paid_accounts"));

    // When
    await apply.execute(subscriptionEvent("evt_old", { id: "sub_accounts", status: "active", quantity: 1, updatedAt: NOW }, "paid_accounts"));

    // Then
    expect((await users.byId("u1"))!.paidAccounts?.quantity).toBe(3);
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
    await apply.execute(subscriptionEvent("evt_new", { status: "active", currentPeriodEnd: NOW + 60 * 86_400_000, updatedAt: NOW + 1000 }));

    // When
    await apply.execute(subscriptionEvent("evt_old", { status: "incomplete", currentPeriodEnd: NOW + 30 * 86_400_000, updatedAt: NOW }));

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
