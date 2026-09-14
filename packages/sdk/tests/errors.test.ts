import { describe, expect, test } from "bun:test";
import { BlockedRequestError, ConnectorError, defaultCacheKey, HttpError } from "../src/connector";
import { validateFields, field } from "../src/fields";

describe("SDK errors", () => {
  test("given an error thrown by another copy of the SDK, when checked with instanceof, then it's still recognised", () => {
    // Given: what a second bundled copy of ConnectorError would produce
    const foreign = Object.assign(new Error("The key was revoked."), { name: "ConnectorError" });
    const foreignHttp = Object.assign(new Error("HTTP 401"), { name: "HttpError", status: 401 });

    // When
    const recognised = [foreign instanceof ConnectorError, foreignHttp instanceof HttpError, foreign instanceof BlockedRequestError];

    // Then
    expect(recognised).toEqual([true, true, false]);
  });

  test("given a plain error, when checked, then it isn't mistaken for an SDK error", () => {
    // Given
    const plain = new Error("boom");

    // When / Then
    expect(plain instanceof ConnectorError).toBe(false);
    expect(plain instanceof HttpError).toBe(false);
  });
});

describe("SDK defaults", () => {
  test("given two packages differing only by case, when grouped by default, then they get different cache keys", () => {
    // Given
    const upper = { metric: "weekly-downloads", params: { package: "JSONStream" } };
    const lower = { metric: "weekly-downloads", params: { package: "jsonstream" } };

    // When
    const keys = [defaultCacheKey(upper), defaultCacheKey(lower)];

    // Then
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("given a long JWT-style key, when a secret field validates it, then it fits the default limit", () => {
    // Given
    const key = "eyJ" + "a".repeat(1200);

    // When
    const result = validateFields([field.secret("key", "API key")], { key });

    // Then
    expect(result.error).toBeNull();
  });

  test("given a blocked request, when its reason is read, then cases can be told apart", () => {
    // Given
    const timeout = new BlockedRequestError("took longer than 6s", "timeout");

    // When / Then
    expect(timeout.reason).toBe("timeout");
    expect(new BlockedRequestError("x").reason).toBe("network");
  });
});
