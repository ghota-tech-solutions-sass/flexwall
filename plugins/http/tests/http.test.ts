import { describe, expect, test } from "bun:test";
import { BlockedRequestError, checkPlugins } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import http, { httpConnector, readPath, toNumber } from "../src/index";

describe("http plugin", () => {
  test("passes the plugin checks", () => expect(checkPlugins([http])).toEqual([]));

  test("readPath walks own properties only", () => {
    const body = { data: { items: [{ mrr: 42 }], "a-b": 1 } };
    expect(readPath(body, "data.items[0].mrr")).toBe(42);
    expect(readPath(body, "$.data.items[0].mrr")).toBe(42);
    expect(readPath(body, "data.a-b")).toBe(1);
    expect(readPath(body, "data.items.0")).toBeUndefined();
    expect(readPath(body, "data.__proto__")).toBeUndefined();
    expect(readPath(body, "data.constructor")).toBeUndefined();
  });

  test("numbers may arrive as strings", () => {
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber("12 users")).toBeNull();
  });

  test("connect sends the header, keeps the URL secret, and shows only the host", async () => {
    let header = "";
    const ctx = fakeContext({ "https://api.example.com/stats": (init?: { headers?: Record<string, string> }) => ((header = init?.headers?.Authorization ?? ""), { data: { mrr: "4,820" } }) });
    const r = await httpConnector.connect!({ url: "https://api.example.com/stats?token=abc", path: "data.mrr", headerName: "Authorization", headerValue: "Bearer s3cret" }, ctx);
    expect(header).toBe("Bearer s3cret");
    expect(r.secret.url).toContain("token=abc");
    expect(JSON.stringify(r.public)).not.toContain("abc");
    expect(JSON.stringify(r.public)).not.toContain("s3cret");
    expect(r.label).toBe("api.example.com → data.mrr");
  });

  test("blocked requests become sentences, objects are refused", async () => {
    const blocked = fakeContext({ "https://": () => { throw new BlockedRequestError("resolves to a private address"); } });
    await expect(httpConnector.connect!({ url: "https://internal.example/" }, blocked)).rejects.toThrow("The endpoint resolves to a private address.");
    const object = fakeContext({ "https://api.example.com/": { data: { a: 1 } } });
    await expect(httpConnector.connect!({ url: "https://api.example.com/", path: "data" }, object)).rejects.toThrow("is an object");
  });
});
