import { describe, expect, test } from "bun:test";
import type { ConnectionView } from "@/domain/connection";
import { credentialsLine, groupByConnector, removalWarning, searchConnectors, usageLine } from "@/presentation/connections";
import { testCatalog } from "../fakes/test-plugin";

const { catalog } = testCatalog();
const view = (over: Partial<ConnectionView>): ConnectionView => ({ id: "c1", connector: "billing", label: "Billing account", public: {}, createdAt: 0, ...over });
const names: Record<string, string> = { billing: "Billing", social: "Social" };

describe("Account lists", () => {
  test("given accounts used by no, one or several tiles, when described, then the owner reads how many and what removing does", () => {
    // Given
    const none: { id: string; name: string }[] = [];
    const one = [{ id: "a", name: "MRR" }];
    const two = [...one, { id: "b", name: "Side MRR" }];

    // When
    const lines = [none, one, two].map((used) => [usageLine(used), removalWarning(used)]);

    // Then
    expect(lines).toEqual([
      ["Not used by any tile", "No tile uses this account."],
      ["Used by 1 tile", "1 tile will wait for another account."],
      ["Used by 2 tiles", "2 tiles will wait for another account."],
    ]);
  });

  test("given credentials that renew, expire later or have expired, when described, then only the ones needing the owner ask to reconnect", () => {
    // Given
    const date = (ms: number) => `day ${ms}`;

    // When
    const lines = [credentialsLine(null, date), credentialsLine({ kind: "renews" }, date), credentialsLine({ kind: "expires", at: 9 }, date), credentialsLine({ kind: "expired", at: 1 }, date)];

    // Then
    expect(lines).toEqual([
      null,
      { tone: "ok", text: "Renews automatically", reconnect: false },
      { tone: "warn", text: "Reconnect before day 9", reconnect: true },
      { tone: "error", text: "Expired — reconnect", reconnect: true },
    ]);
  });

  test("given accounts of several providers, when grouped, then providers read by name and accounts in the order they were connected", () => {
    // Given
    const views = [view({ id: "s1", connector: "social" }), view({ id: "b2", createdAt: 20 }), view({ id: "b1", createdAt: 10 })];

    // When
    const groups = groupByConnector(views, (id) => names[id]);

    // Then
    expect(groups.map((g) => [g.name, g.connections.map((c) => c.id)])).toEqual([
      ["Billing", ["b1", "b2"]],
      ["Social", ["s1"]],
    ]);
  });

  test("given a search, when connectors are filtered, then only those taking an account match, names starting with it first", () => {
    // Given
    const connectors = catalog.connectors();

    // When
    const all = searchConnectors(connectors, "").map((c) => c.id);
    const found = searchConnectors(connectors, " SOC ").map((c) => c.id);
    const byDescription = searchConnectors(connectors, "money").map((c) => c.id);
    const nothing = searchConnectors(connectors, "zzz");

    // Then
    expect(all).toEqual(["billing", "brokerage", "metered", "sandboxed", "social"]);
    expect(found).toEqual(["social"]);
    expect(byDescription).toEqual(["brokerage"]);
    expect(nothing).toEqual([]);
  });
});
