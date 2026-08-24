import { describe, expect, test } from "bun:test";
import { extractPageMeta, isSafeExternalUrl } from "../../src/lib/enrich";

describe("SSRF guard", () => {
  const ok = (u: string) => isSafeExternalUrl(new URL(u));
  test("allows public http(s)", () => {
    expect(ok("https://kittenclash.com")).toBe(true);
    expect(ok("http://example.com/path")).toBe(true);
  });
  test("blocks private, loopback, metadata and odd ports", () => {
    for (const u of [
      "http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/",
      "http://172.16.0.1/", "http://169.254.169.254/", "http://metadata.google.internal/",
      "http://foo.internal/", "https://example.com:8080/", "ftp://example.com/",
    ]) expect(ok(u)).toBe(false);
  });
});

describe("extractPageMeta", () => {
  test("title + meta description, entities decoded", () => {
    const html = `<html><head><title>Kitten &amp; Clash</title>
      <meta name="description" content="Battle cats &quot;live&quot;"></head></html>`;
    expect(extractPageMeta(html)).toEqual({ title: "Kitten & Clash", description: 'Battle cats "live"' });
  });
  test("og:description and reversed attribute order", () => {
    const html = `<head><meta content="Great site" property="og:description"><title>T</title></head>`;
    expect(extractPageMeta(html).description).toBe("Great site");
  });
  test("no meta → empty", () => {
    expect(extractPageMeta("<html><body>hi</body></html>")).toEqual({ title: undefined, description: undefined });
  });
  test("tags stripped and length capped", () => {
    const html = `<title>${"x".repeat(400)}</title>`;
    expect(extractPageMeta(html).title!.length).toBeLessThanOrEqual(200);
  });
});
