import { describe, expect, test } from "bun:test";
import { isPrivateAddress, readPath, safeFetchJson, toNumber, validateTarget } from "@/lib/net/safe-fetch";

describe("safe fetch guard", () => {
  test("private and special addresses are blocked", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "not-an-ip"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  test("targets are validated before any socket opens", () => {
    expect(() => validateTarget("http://example.com")).toThrow("https");
    expect(() => validateTarget("https://169.254.169.254/computeMetadata/v1")).toThrow("private");
    expect(() => validateTarget("https://[::1]/")).toThrow("private");
    expect(() => validateTarget("https://metadata.google.internal/")).toThrow("private");
    expect(() => validateTarget("https://localhost:8443/")).toThrow("private");
    expect(() => validateTarget("https://user:pass@example.com/")).toThrow("password");
    expect(validateTarget("https://api.example.com/stats?x=1").hostname).toBe("api.example.com");
  });

  test("a public name resolving to a private address is refused at connect time", async () => {
    // localtest.me is public DNS that answers 127.0.0.1. Offline, the lookup itself fails: also a refusal,
    // but never a plain "connection refused", which would mean a socket to 127.0.0.1 was opened.
    const error = await safeFetchJson("https://localtest.me/", { timeoutMs: 3000 }).catch((e: Error) => e);
    expect(String(error)).toMatch(/private address|ENOTFOUND|EAI_AGAIN|getaddrinfo/);
    expect(String(error)).not.toMatch(/ECONNREFUSED/);
  });

  test("readPath walks own properties only", () => {
    const body = { data: { items: [{ mrr: 42 }], "a-b": 1 } };
    expect(readPath(body, "data.items[0].mrr")).toBe(42);
    expect(readPath(body, "$.data.items[0].mrr")).toBe(42);
    expect(readPath(body, "data.a-b")).toBe(1);
    expect(readPath(body, "data.items.0")).toBeUndefined();
    expect(readPath(body, "data.__proto__")).toBeUndefined();
    expect(readPath(body, "data.constructor")).toBeUndefined();
    expect(readPath(7, "")).toBe(7);
  });

  test("numbers may arrive as strings", () => {
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber(12)).toBe(12);
    expect(toNumber("12 users")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });
});
