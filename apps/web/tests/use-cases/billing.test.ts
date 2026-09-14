import { describe, expect, test } from "bun:test";
import { ApplyBillingEvent, OpenBillingPortal, StartCheckout } from "@/application/use-cases/billing";
import type { BillingEvent } from "@/application/ports";
import { planOf } from "@/domain/user";
import { aSubscription, aUser, NOW } from "../builders";
import { FakePayments, FixedClock, InMemoryEventLog, InMemoryUsers } from "../fakes";

describe("StartCheckout", () => {
  test("given a free user, when they pick yearly, then they're sent to checkout and remembered as a customer", async () => {
    // Given
    const users = new InMemoryUsers();
    const payments = new FakePayments();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCheckout({ users, payments, clock: new FixedClock(), appUrl: "https://flexwall.test" });

    // When
    const { url } = await checkout.execute({ userId: "u1", plan: "yearly" });

    // Then
    expect(url).toBe("https://pay.test/yearly");
    expect(payments.checkouts).toEqual([{ userId: "u1", plan: "yearly" }]);
    expect((await users.byId("u1"))!.stripeCustomerId).toBe("cus_u1");
  });

  test("given a Pro subscriber, when they try to subscribe again, then they're sent to billing instead", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").pro().build());
    const checkout = new StartCheckout({ users, payments: new FakePayments(), clock: new FixedClock(), appUrl: "https://flexwall.test" });

    // When
    const attempt = checkout.execute({ userId: "u1", plan: "monthly" });

    // Then
    await expect(attempt).rejects.toThrow("You're already Pro.");
  });

  test("given payments switched off, when someone upgrades, then they're told plainly", async () => {
    // Given
    const users = new InMemoryUsers();
    await users.save(aUser().withId("u1").build());
    const checkout = new StartCheckout({ users, payments: new FakePayments(false), clock: new FixedClock(), appUrl: "https://flexwall.test" });

    // When
    const attempt = checkout.execute({ userId: "u1", plan: "lifetime" });

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
    const attempt = new OpenBillingPortal({ users, payments: new FakePayments(), appUrl: "https://x" }).execute({ userId: "u1" });

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
    return { users, apply: new ApplyBillingEvent({ users, events: new InMemoryEventLog() }) };
  }

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
