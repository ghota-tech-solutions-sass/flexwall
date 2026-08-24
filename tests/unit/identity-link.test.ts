import { describe, expect, test } from "bun:test";
import { identityLink } from "../../src/lib/identity-link";

const href = (s: string) => identityLink(s)?.href ?? null;

describe("identityLink", () => {
  test("x handles", () => {
    expect(href("@mben_dev")).toBe("https://x.com/mben_dev");
    expect(href("@@elon")).toBe("https://x.com/elon");
    expect(href("@way_too_long_for_an_x_handle")).toBeNull();
    expect(href("@bad-chars")).toBeNull();
  });
  test("x/twitter urls normalize to x.com", () => {
    expect(href("x.com/mben_dev")).toBe("https://x.com/mben_dev");
    expect(href("https://twitter.com/mben_dev/status/1")).toBe("https://x.com/mben_dev");
    expect(href("https://www.x.com/")).toBeNull();
  });
  test("web urls and known-TLD bare domains", () => {
    expect(href("https://ghotatechsolutions.com")).toBe("https://ghotatechsolutions.com/");
    expect(href("kittenclash.com")).toBe("https://kittenclash.com/");
    expect(href("www.lettrio.app/pricing")).toBe("https://www.lettrio.app/pricing");
  });
  test("never emits non-http and leaves names alone", () => {
    expect(href("javascript:alert(1)")).toBeNull();
    expect(href("ftp://files.example.com")).toBeNull();
    expect(href("crypto.karen")).toBeNull();
    expect(href("Trust Fund Tom")).toBeNull();
    expect(href("quietmoney")).toBeNull();
  });
});
