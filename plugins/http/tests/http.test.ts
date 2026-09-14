import { describe, expect, test } from "bun:test";
import { BlockedRequestError, checkPlugins } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import http, { httpConnector, readPath, toNumber } from "../src/index";

describe("http plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When / Then
    expect(checkPlugins([http])).toEqual([]);
  });

  test("given a JSON body, when paths are read, then only own properties are reachable", () => {
    // Given
    const body = { data: { items: [{ mrr: 42 }], "a-b": 1 } };

    // When
    const found = [readPath(body, "data.items[0].mrr"), readPath(body, "$.data.items[0].mrr"), readPath(body, "data.a-b")];
    const refused = [readPath(body, "data.items.0"), readPath(body, "data.__proto__"), readPath(body, "data.constructor")];

    // Then
    expect(found).toEqual([42, 42, 1]);
    expect(refused).toEqual([undefined, undefined, undefined]);
  });

  test("given numbers written as strings, when converted, then formatted ones parse and words don't", () => {
    // Given / When / Then
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber("12 users")).toBeNull();
  });

  test("given an endpoint with a token in its URL and a header, when connecting, then both stay secret and only the host is shown", async () => {
    // Given
    let header = "";
    const ctx = fakeContext({ "https://api.example.com/stats": (init?: { headers?: Record<string, string> }) => ((header = init?.headers?.Authorization ?? ""), { data: { mrr: "4,820" } }) });

    // When
    const result = await httpConnector.connect!({ url: "https://api.example.com/stats?token=abc", path: "data.mrr", headerName: "Authorization", headerValue: "Bearer s3cret" }, ctx);

    // Then
    expect(header).toBe("Bearer s3cret");
    expect(result.secret.url).toContain("token=abc");
    expect(JSON.stringify(result.public)).not.toContain("abc");
    expect(JSON.stringify(result.public)).not.toContain("s3cret");
    expect(result.label).toBe("api.example.com → data.mrr");
  });

  test("given a request the host blocks, when connecting, then the reason reads as a sentence", async () => {
    // Given
    const ctx = fakeContext({
      "https://": () => {
        throw new BlockedRequestError("resolves to a private address");
      },
    });

    // When
    const attempt = httpConnector.connect!({ url: "https://internal.example/" }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("The endpoint resolves to a private address.");
  });

  test("given a path that points at an object, when connecting, then the owner is asked to point inside it", async () => {
    // Given
    const ctx = fakeContext({ "https://api.example.com/": { data: { a: 1 } } });

    // When
    const attempt = httpConnector.connect!({ url: "https://api.example.com/", path: "data" }, ctx);

    // Then
    await expect(attempt).rejects.toThrow("is an object");
  });
});
