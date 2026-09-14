import { describe, expect, test } from "bun:test";
import { BlockedRequestError, ConnectorError, HttpError } from "../src/connector";

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
