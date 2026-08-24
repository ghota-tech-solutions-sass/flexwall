import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "unit-test-secret";
});

describe("session tokens", () => {
  test("session round-trip, magic and session kinds are not interchangeable", async () => {
    const { createSessionToken, verifySessionToken, createMagicToken, verifyMagicToken } = await import("../../src/lib/session");
    const s = createSessionToken("bob");
    expect(verifySessionToken(s)).toBe("bob");
    expect(verifyMagicToken(s)).toBeNull();
    const m = createMagicToken("bob", 60_000);
    expect(verifyMagicToken(m)).toBe("bob");
    expect(verifySessionToken(m)).toBeNull();
  });
  test("expiry and tampering are rejected", async () => {
    const { createMagicToken, verifyMagicToken } = await import("../../src/lib/session");
    expect(verifyMagicToken(createMagicToken("bob", -1))).toBeNull();
    const m = createMagicToken("bob", 60_000);
    expect(verifyMagicToken(m.slice(0, -2) + "xx")).toBeNull();
    expect(verifyMagicToken("garbage")).toBeNull();
    expect(verifyMagicToken(undefined)).toBeNull();
  });
});
