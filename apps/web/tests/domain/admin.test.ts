import { describe, expect, test } from "bun:test";
import { isAdministrator, offerPro, parseAdministrators, withdrawPro } from "@/domain/admin";
import { entitlementsOf, paidPlanOf, planSourceOf } from "@/domain/user";
import { aUser, NOW } from "../builders";

const DAY = 24 * 60 * 60 * 1000;

describe("Administrators", () => {
  test("given the operator's list as typed, when parsed, then emails are clean and anything else is dropped", () => {
    // Given / When / Then
    expect(parseAdministrators(" Ada@Example.com, bob@x.io\nnot-an-email ")).toEqual(["ada@example.com", "bob@x.io"]);
    expect(parseAdministrators(undefined)).toEqual([]);
  });

  test("given a list, when accounts are checked, then only listed emails are administrators, whatever their case", () => {
    // Given
    const admins = ["ada@example.com"];

    // When / Then
    expect(isAdministrator(aUser().withEmail("ADA@example.com").build(), admins)).toBe(true);
    expect(isAdministrator(aUser().withEmail("eve@example.com").build(), admins)).toBe(false);
    expect(isAdministrator(aUser().withEmail("ada@example.com").build(), [])).toBe(false);
    expect(isAdministrator(null, admins)).toBe(false);
  });
});

describe("Offered Pro", () => {
  test("given a free account, when Pro is offered for a month, then it has Pro until then without paying, and loses it after", () => {
    // Given
    const user = aUser().build();

    // When
    const offered = offerPro(user, { term: "1m", note: "Beta tester", by: "admin@flexwall.lol", now: NOW });

    // Then
    expect(offered.complimentary).toEqual({ until: NOW + 30 * DAY, grantedAt: NOW, grantedBy: "admin@flexwall.lol", note: "Beta tester" });
    expect(entitlementsOf(offered, NOW).paid).toBe(true);
    expect(planSourceOf(offered, NOW)).toBe("complimentary");
    expect(paidPlanOf(offered, NOW)).toBe("free");
    expect(entitlementsOf(offered, NOW + 31 * DAY).plan).toBe("free");
  });

  test("given Pro already offered, when a term is added, then it starts where the current one ends", () => {
    // Given
    const user = aUser().offeredPro(NOW + 10 * DAY).build();

    // When
    const extended = offerPro(user, { term: "3m", note: "", by: "admin@flexwall.lol", now: NOW });

    // Then
    expect(extended.complimentary!.until).toBe(NOW + 100 * DAY);
  });

  test("given Pro offered with no end, when a term is asked for, then it's refused until the offer is taken back", () => {
    // Given
    const user = aUser().offeredPro(null).build();

    // When
    const attempt = () => offerPro(user, { term: "1y", note: "", by: "admin@flexwall.lol", now: NOW });

    // Then
    expect(attempt).toThrow("Take it back first");
    expect(entitlementsOf(user, NOW + 3650 * DAY).plan).toBe("pro");
  });

  test("given a subscriber with offered Pro, when the offer is taken back, then the subscription still counts", () => {
    // Given
    const user = aUser().pro().offeredPro(null).build();

    // When
    const withdrawn = withdrawPro(user);

    // Then
    expect(withdrawn.complimentary).toBeNull();
    expect(planSourceOf(user, NOW)).toBe("subscription");
    expect(entitlementsOf(withdrawn, NOW).plan).toBe("pro");
  });

  test("given a note longer than allowed or an unknown term, when Pro is offered, then it's refused", () => {
    // Given
    const user = aUser().build();

    // When / Then
    expect(() => offerPro(user, { term: "1m", note: "x".repeat(201), by: "a@b.c", now: NOW })).toThrow("under 200");
    expect(() => offerPro(user, { term: "10y" as never, note: "", by: "a@b.c", now: NOW })).toThrow("how long");
  });
});
