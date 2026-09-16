import { describe, expect, test } from "bun:test";
import type { ServerStatus } from "@flexwall/sdk";
import { effectiveAvailability, isAvailability, overrideOf, visibleTo, type Availability } from "@/domain/connector-policy";

const production: ServerStatus = { configured: true, environment: "production" };
const sandbox: ServerStatus = { configured: true, environment: "sandbox" };
const missing: ServerStatus = { configured: false, environment: "production" };

describe("Connector availability", () => {
  test("given a connector nobody has touched, when it's asked for, then everyone may use it", () => {
    // Given / When / Then
    expect(effectiveAvailability(null, undefined)).toBe("everyone");
    expect(effectiveAvailability(production, undefined)).toBe("everyone");
  });

  test("given credentials pointing at a provider's sandbox, when an administrator opens it to everyone, then it stays with administrators", () => {
    // Given
    const chosen: Availability = "everyone";

    // When
    const applied = effectiveAvailability(sandbox, chosen);

    // Then
    expect(applied).toBe("admins");
    expect(overrideOf(sandbox)).toBe("sandbox");
  });

  test("given a sandbox connector an administrator took off, when it's asked for, then it stays off", () => {
    // Given / When / Then
    expect(effectiveAvailability(sandbox, "off")).toBe("off");
  });

  test("given missing server credentials, when anything was chosen, then nobody may use it", () => {
    // Given
    const choices: Availability[] = ["everyone", "admins", "off"];

    // When
    const applied = choices.map((c) => effectiveAvailability(missing, c));

    // Then
    expect(applied).toEqual(["off", "off", "off"]);
    expect(overrideOf(missing)).toBe("unconfigured");
  });

  test("given each availability, when a visitor and an administrator look, then only administrators see what's kept for them", () => {
    // Given
    const visitor = { administrator: false };
    const admin = { administrator: true };

    // When
    const seen = (["everyone", "admins", "off"] as Availability[]).map((a) => [visibleTo(a, visitor), visibleTo(a, admin)]);

    // Then
    expect(seen).toEqual([
      [true, true],
      [false, true],
      [false, false],
    ]);
  });

  test("given what a request can carry, when it's read as an availability, then only the three known ones are accepted", () => {
    // Given
    const asked: unknown[] = ["everyone", "admins", "off", "EVERYONE", "", undefined, 1];

    // When
    const accepted = asked.filter(isAvailability);

    // Then
    expect(accepted).toEqual(["everyone", "admins", "off"]);
  });
});
