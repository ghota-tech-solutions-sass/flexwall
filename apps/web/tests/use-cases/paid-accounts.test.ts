import { describe, expect, test } from "bun:test";
import { AddPaidAccount, GetPaidAccounts, ReconcilePaidAccounts, usesPaidAccounts } from "@/application/use-cases/paid-accounts";
import { TERMS_VERSION } from "@/domain/publisher";
import { aConnection, aUser, NOW } from "../builders";
import { FakeLinks, FakePayments, FixedClock, InMemoryConnections, InMemoryUsers } from "../fakes";
import { testCatalog } from "../fakes/test-plugin";

function setup(payments = new FakePayments()) {
  const { catalog } = testCatalog();
  const users = new InMemoryUsers();
  const connections = new InMemoryConnections();
  const deps = { users, connections, catalog, payments, clock: new FixedClock(), links: new FakeLinks(), log: () => {} };
  const bank = (id: string, at = NOW) => aConnection().withId(id).ownedBy({ id: "u1" }).forConnector("bank").withLabel(`Bank ${id}`).connectedAt(at).build();
  return { users, connections, payments, bank, add: new AddPaidAccount(deps), view: new GetPaidAccounts(deps), reconcile: new ReconcilePaidAccounts(deps) };
}

describe("Adding a paid account", () => {
  test("given a Pro owner with no accounts subscription, when they add one, then checkout opens for a single account", async () => {
    // Given
    const { users, payments, add } = setup();
    await users.save(aUser().withId("u1").pro().build());

    // When
    const result = await add.execute({ userId: "u1", acceptedTerms: true });

    // Then
    expect(result).toEqual({ mode: "checkout", url: "https://pay.test/accounts/1" });
    expect(payments.accountCheckouts).toEqual([{ userId: "u1", quantity: 1, consent: { termsVersion: TERMS_VERSION, acceptedAt: NOW } }]);
  });

  test("given an owner already paying for one account, when they add another, then the subscription grows instead of a second checkout", async () => {
    // Given
    const { users, connections, payments, bank, add } = setup();
    await users.save(aUser().withId("u1").pro().withPaidAccounts(1).build());
    await connections.save(bank("b1"));

    // When
    const result = await add.execute({ userId: "u1", acceptedTerms: true });

    // Then
    expect(result).toEqual({ mode: "added", allowance: 2 });
    expect(payments.quantityChanges).toEqual([{ subscriptionId: "sub_accounts", quantity: 2, direction: "up" }]);
    expect(payments.accountCheckouts).toEqual([]);
    expect((await users.byId("u1"))!.paidAccounts?.quantity).toBe(2);
  });

  test("given a free owner, when they add an account, then they're told to go Pro first and nothing is charged", async () => {
    // Given
    const { users, payments, add } = setup();
    await users.save(aUser().withId("u1").build());

    // When
    const attempt = add.execute({ userId: "u1", acceptedTerms: true });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "plan_limit" });
    expect(payments.accountCheckouts).toEqual([]);
  });

  test("given the terms not accepted, when an owner adds an account, then nothing is charged", async () => {
    // Given
    const { users, payments, add } = setup();
    await users.save(aUser().withId("u1").pro().build());

    // When
    const attempt = add.execute({ userId: "u1", acceptedTerms: false });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
    expect(payments.accountCheckouts).toEqual([]);
  });

  test("given an owner at the ceiling, when they add one more, then it's refused", async () => {
    // Given
    const { users, add } = setup();
    await users.save(aUser().withId("u1").pro().withPaidAccounts(10).build());

    // When
    const attempt = add.execute({ userId: "u1", acceptedTerms: true });

    // Then
    await expect(attempt).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("Keeping the bill in step with what's connected", () => {
  test("given two accounts paid for and one connected, when it's reconciled, then the bill comes down", async () => {
    // Given
    const { users, connections, payments, bank, reconcile } = setup();
    await users.save(aUser().withId("u1").pro().withPaidAccounts(2).build());
    await connections.save(bank("b1"));

    // When
    await reconcile.execute({ userId: "u1" });

    // Then
    expect(payments.quantityChanges).toEqual([{ subscriptionId: "sub_accounts", quantity: 1, direction: "down" }]);
    expect((await users.byId("u1"))!.paidAccounts?.quantity).toBe(1);
  });

  test("given more connected than paid for, when it's reconciled, then nobody is charged for the difference", async () => {
    // Given
    const { users, connections, payments, bank, reconcile } = setup();
    await users.save(aUser().withId("u1").pro().withPaidAccounts(1).build());
    await connections.save(bank("b1"));
    await connections.save(bank("b2"));

    // When
    await reconcile.execute({ userId: "u1" });

    // Then
    expect(payments.quantityChanges).toEqual([]);
  });

  test("given a second accounts subscription from a double checkout, when it's reconciled, then the newcomer is cancelled", async () => {
    // Given
    const payments = new FakePayments();
    const { users, connections, bank, reconcile } = setup(payments);
    await users.save(aUser().withId("u1").withStripeCustomer("cus_u1").pro().withPaidAccounts(1).build());
    await connections.save(bank("b1"));
    payments.extraSubscriptions = [{ id: "sub_accounts", status: "active", interval: "month", currentPeriodEnd: NOW, cancelAtPeriodEnd: false, quantity: 1, updatedAt: NOW }, { id: "sub_double", status: "active", interval: "month", currentPeriodEnd: NOW, cancelAtPeriodEnd: false, quantity: 1, updatedAt: NOW }];

    // When
    await reconcile.execute({ userId: "u1" });

    // Then
    expect(payments.cancelled).toEqual(["sub_double"]);
  });

  test("given the payment provider is down, when it's reconciled, then it gives up quietly", async () => {
    // Given
    const { users, connections, bank, reconcile } = setup(new FakePayments(true, {}, "quantity"));
    await users.save(aUser().withId("u1").pro().withPaidAccounts(2).build());
    await connections.save(bank("b1"));

    // When
    const outcome = reconcile.execute({ userId: "u1" });

    // Then
    await expect(outcome).resolves.toBeUndefined();
  });
});

describe("What settings shows", () => {
  test("given an owner with no paid account at all, when the view is read, then the section doesn't concern them", async () => {
    // Given
    const { users, view } = setup();
    await users.save(aUser().withId("u1").pro().build());

    // When
    const shown = await view.execute({ userId: "u1" });

    // Then
    expect(shown).toMatchObject({ allowance: 0, used: 0, monthlyUsd: 0 });
    expect(usesPaidAccounts(shown)).toBe(false);
  });

  test("given one account paid for and two connected, when the view is read, then the older one is covered and the cost is one account", async () => {
    // Given
    const { users, connections, bank, view } = setup();
    await users.save(aUser().withId("u1").pro().withPaidAccounts(1).build());
    await connections.save(bank("older", NOW - 86_400_000));
    await connections.save(bank("newer", NOW));

    // When
    const shown = await view.execute({ userId: "u1" });

    // Then
    expect(shown).toMatchObject({ allowance: 1, used: 2, monthlyUsd: 5 });
    expect(shown.accounts.map((a) => [a.id, a.covered])).toEqual([
      ["older", true],
      ["newer", false],
    ]);
    expect(usesPaidAccounts(shown)).toBe(true);
  });
});
