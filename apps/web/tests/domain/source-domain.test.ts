import { expect, test } from "bun:test";
import { publicSourceDomain } from "@/domain/source-domain";

test("public API provenance accepts only a hostname and strips ports", () => {
  expect(publicSourceDomain("API.example.com:8443")).toBe("api.example.com");
  expect(publicSourceDomain("api.example.com")).toBe("api.example.com");
  for (const value of [undefined, "", "https://api.example.com/path?token=secret", "user:password@api.example.com", "api.example.com/path", "api.example.com?token=secret", "api.example.com#fragment", "api.example.com\\private", "api.example.com secret"]) expect(publicSourceDomain(value)).toBeUndefined();
});
