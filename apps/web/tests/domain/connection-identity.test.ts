import { describe, expect, test } from "bun:test";
import { connectionDetail, connectionName, credentialsState, disambiguate, displayNames, normalizeNickname, viewOf, type ConnectionView } from "@/domain/connection";
import { aConnection } from "../builders";

const view = (over: Partial<ConnectionView> = {}): ConnectionView => ({ id: "c1", connector: "billing", label: "Billing account", public: {}, createdAt: 0, ...over });

describe("Telling connections apart", () => {
  test("given a connection saved before owners could name accounts, when shown, then it has no nickname and goes by its label", () => {
    // Given
    const old = aConnection().withId("c1").build();

    // When
    const shown = viewOf(old);

    // Then
    expect(shown.nickname).toBeNull();
    expect(connectionName(shown)).toBe("Stripe live (USD)");
  });

  test("given a named connection, when shown, then its nickname wins over the label, and a blank label falls back to the connector", () => {
    // Given
    const named = view({ nickname: "Side project" });
    const blank = view({ label: "" });

    // When
    const names = [connectionName(named, "Billing"), connectionName(blank, "Billing")];

    // Then
    expect(names).toEqual(["Side project", "Billing"]);
  });

  test("given names typed with spaces, blank or too long, when normalized, then they're trimmed, cleared or cut at 40", () => {
    // Given
    const typed = ["  Main shop  ", "   ", null, "x".repeat(45)];

    // When
    const stored = typed.map(normalizeNickname);

    // Then
    expect(stored).toEqual(["Main shop", null, null, "x".repeat(40)]);
  });

  test("given the public values connectors give, when the detail line is built, then the most telling two facts show and secrets never do", () => {
    // Given
    const social = view({ label: "@ada", public: { handle: "ada", hint: "…9f2c", userId: "42" } });
    const bank = view({ label: "Plaid", public: { institution: "Chase", accounts: "3", country: "US" } });
    const one = view({ label: "Powens", public: { banks: "BNP", accounts: "1" } });
    const key = view({ label: "Stripe live", public: { hint: "rk_live_…abcd", currency: "usd", mode: "live" } });
    const broker = view({ label: "Alpaca", public: { hint: "…ab12", account: "…7788", accounts: "…7788" } });
    const bare = view({ public: {} });

    // When
    const lines = [social, bank, one, key, broker, bare].map(connectionDetail);

    // Then
    expect(lines).toEqual(["…9f2c", "Chase · 3 accounts", "BNP · 1 account", "rk_live_…abcd · USD", "…ab12", ""]);
  });

  test("given a nickname, when the detail line is built, then facts the label repeated come back since the label is hidden", () => {
    // Given
    const named = view({ label: "@ada", nickname: "Personal", public: { handle: "ada" } });

    // When
    const line = connectionDetail(named);

    // Then
    expect(line).toBe("@ada");
  });

  test("given two accounts of one connector that read the same, when named, then they're numbered in the order they were connected", () => {
    // Given
    const views = [
      view({ id: "later", createdAt: 20 }),
      view({ id: "first", createdAt: 10 }),
      view({ id: "named", createdAt: 5, nickname: "Side project" }),
      view({ id: "other-connector", connector: "brokerage", createdAt: 1 }),
    ];

    // When
    const names = disambiguate(views);

    // Then
    expect(names).toEqual({ first: "Billing account · 1", later: "Billing account · 2", named: "Side project", "other-connector": "Billing account" });
    // Lists that cut long names keep the number apart.
    expect(displayNames(views).later).toEqual({ name: "Billing account", number: 2 });
  });

  test("given accounts connected at the same instant, when named, then the numbering is stable", () => {
    // Given
    const views = [view({ id: "b" }), view({ id: "a" })];

    // When
    const names = [disambiguate(views), disambiguate([...views].reverse())];

    // Then
    expect(names[0]).toEqual({ a: "Billing account · 1", b: "Billing account · 2" });
    expect(names[1]).toEqual(names[0]!);
  });

  test("given credentials that expire, when their state is read, then they renew on their own, last until a date, or have lapsed", () => {
    // Given
    const now = 1_000;

    // When
    const states = [credentialsState(view(), false, now), credentialsState(view({ expiresAt: 5_000 }), true, now), credentialsState(view({ expiresAt: 5_000 }), false, now), credentialsState(view({ expiresAt: 500 }), false, now)];

    // Then
    expect(states).toEqual([null, { kind: "renews" }, { kind: "expires", at: 5_000 }, { kind: "expired", at: 500 }]);
  });
});
