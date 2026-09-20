import { expect, test } from "bun:test";
import { number, type InputValue } from "@flexwall/sdk";
import { provenanceOf } from "@/rendering/provenance";
const value = (source?: InputValue["source"], stale = false): InputValue => ({ value: number(42), stale, source });
const provider = { connector: "stripe", name: "Stripe", verified: true };
test("only fully provider-backed current data gets a verified label", () => {
  expect(provenanceOf({ a: value(provider) })?.kind).toBe("verified");
  expect(provenanceOf({ a: value(provider), b: value() })?.kind).toBe("mixed");
  expect(provenanceOf({ a: value({ connector: "http", name: "Your API", verified: false }) })?.kind).toBe("synced");
  expect(provenanceOf({ a: value(provider, true) })?.kind).toBe("stale");
  expect(provenanceOf({ a: value({ ...provider, sample: true }) })?.kind).toBe("sample");
  expect(provenanceOf({ a: value() })?.kind).toBe("manual");
  expect(provenanceOf({})).toBeNull();
});

test("the profile counts the same verified tiles as their badges", async () => {
  const { verifiedCount } = await import("@/presentation/wall/profile");
  const ready = (inputs: Record<string, InputValue>) => ({ status: "ready" as const, inputs });
  expect(verifiedCount({
    direct: ready({ a: value(provider) }),
    sample: ready({ a: value({ ...provider, sample: true }) }),
    stale: ready({ a: value(provider, true) }),
    mixed: ready({ a: value(provider), b: value() }),
    api: ready({ a: value({ connector: "http", name: "Your API", verified: false }) }),
    empty: ready({}),
  })).toBe(2);
});

test("API verification names only the sanitized domain", () => {
  const api = { connector: "http", name: "Your API", verified: false, domain: "api.example.com" };
  expect(provenanceOf({ a: value(api) })).toMatchObject({ kind: "synced", label: "API verified · Your API" });
  expect(provenanceOf({ a: value(api) })?.detail).toContain("api.example.com");
  const unsafe = provenanceOf({ a: value({ ...api, domain: "https://user:secret@api.example.com/private?token=hidden" }) });
  expect(unsafe?.detail).not.toContain("secret");
  expect(unsafe?.detail).not.toContain("token=");
});
