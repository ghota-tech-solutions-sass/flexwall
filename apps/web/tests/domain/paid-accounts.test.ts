import { describe, expect, test } from "bun:test";
import { allowanceOf, countPaidAccounts, coveredConnectionIds, isPaidAccountConnector, paidAccountsOf } from "@/domain/paid-accounts";
import { MAX_PAID_ACCOUNTS } from "@/domain/pricing";
import { PAST_DUE_GRACE_MS, type Subscription } from "@/domain/user";
import { aConnection, NOW } from "../builders";
import { testCatalog } from "../fakes/test-plugin";

const { catalog } = testCatalog();
const subscription = (over: Partial<Subscription>): Subscription => ({
  id: "sub_accounts",
  status: "active",
  interval: "month",
  currentPeriodEnd: NOW + 30 * 86_400_000,
  cancelAtPeriodEnd: false,
  quantity: 2,
  updatedAt: NOW,
  ...over,
});
const bank = (id: string, at: number) => aConnection().withId(id).forConnector("bank").connectedAt(at).build();

describe("Accounts paid for monthly", () => {
  test("given the connectors in the catalog, when asked which cost a monthly fee, then only those that declare it do", () => {
    // Given / When
    const paid = catalog.connectors().filter((c) => isPaidAccountConnector(c)).map((c) => c.id);

    // Then
    expect(paid).toEqual(["bank"]);
  });

  test("given a mix of connections, when they're counted, then only the ones that cost a fee count", () => {
    // Given
    const connections = [bank("b1", NOW), aConnection().withId("s1").forConnector("social").build(), bank("b2", NOW + 1)];

    // When
    const paid = paidAccountsOf(connections, catalog).map((c) => c.id);

    // Then
    expect(paid).toEqual(["b1", "b2"]);
    expect(countPaidAccounts(connections, catalog)).toBe(2);
  });

  test("given each subscription status, when the allowance is read, then only a paying one counts, with the same grace as Pro", () => {
    // Given
    const cases: [Partial<Subscription>, number, number][] = [
      [{ status: "active" }, NOW, 2],
      [{ status: "trialing" }, NOW, 2],
      [{ status: "past_due" }, NOW + 30 * 86_400_000 + PAST_DUE_GRACE_MS - 1, 2],
      [{ status: "past_due" }, NOW + 30 * 86_400_000 + PAST_DUE_GRACE_MS + 1, 0],
      [{ status: "canceled" }, NOW, 0],
      [{ status: "unpaid" }, NOW, 0],
    ];

    // When
    const allowances = cases.map(([over, at]) => allowanceOf({ paidAccounts: subscription(over) }, at));

    // Then
    expect(allowances).toEqual(cases.map(([, , expected]) => expected));
  });

  test("given accounts an administrator gave and a lapsed subscription, when the allowance is read, then the gift stands", () => {
    // Given
    const user = { paidAccounts: subscription({ status: "canceled" }), paidAccountsGranted: 3 };

    // When / Then
    expect(allowanceOf(user, NOW)).toBe(3);
    expect(allowanceOf({ paidAccounts: null, paidAccountsGranted: MAX_PAID_ACCOUNTS + 5 }, NOW)).toBe(MAX_PAID_ACCOUNTS);
  });

  test("given fewer accounts paid for than connected, when the covered ones are chosen, then the oldest keep their place", () => {
    // Given
    const connections = [bank("newest", NOW + 2), bank("oldest", NOW), bank("middle", NOW + 1)];

    // When
    const covered = coveredConnectionIds(connections, catalog, 2);

    // Then
    expect([...covered].sort()).toEqual(["middle", "oldest"]);
    expect(coveredConnectionIds(connections, catalog, 0).size).toBe(0);
  });
});
