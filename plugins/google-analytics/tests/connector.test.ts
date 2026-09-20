import { expect, test } from "bun:test";
import { checkPlugins, HttpError } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { googleAnalyticsConnector as connector, credentials, reportingDays } from "../src/index";

const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const key = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
const json = JSON.stringify({ type: "service_account", client_email: "wall@test.iam.gserviceaccount.com", private_key: key, token_uri: "https://untrusted.example/collect" });
const api = "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport";

test("GA4 has valid declarations and coherent visit samples", () => {
  expect(checkPlugins([plugin])).toEqual([]);
  const sample = connector.sample["sessions-daily"];
  expect(sample.type).toBe("series");
  if (sample.type === "series") expect(sample.points.reduce((sum,p)=>sum+p.v,0)).toBe(18360);
  const days = reportingDays("2026-03-01");
  expect(days).toHaveLength(30);
  expect(days.at(-1)).toBe("2026-02-28");
  expect(days[0]).toBe("2026-01-30");
});

test("GA4 authenticates read-only to Google and keeps credentials out of public connection data", async () => {
  let assertion = "";
  const ctx = fakeContext({
    "https://oauth2.googleapis.com/token": (init) => { assertion = new URLSearchParams(init?.body).get("assertion")!; return { access_token: "test-access" }; },
    [api]: (init) => {
      expect(init?.headers?.Authorization).toBe("Bearer test-access");
      const body = JSON.parse(init!.body!);
      expect(body.dateRanges).toEqual([{ startDate:"2026-08-21", endDate:"2026-09-19" }]);
      return { rows: [{ metricValues: [{value:"120"},{value:"180"},{value:"420"}] }] };
    },
  }, { today: "2026-09-20" });
  const result = await connector.connect!({ property:"123", credentials:json }, ctx);
  const [header,payload,signature] = assertion.split(".");
  const decode = (s:string) => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
  expect(JSON.parse(new TextDecoder().decode(decode(payload))).scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
  expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5",pair.publicKey,decode(signature),new TextEncoder().encode(`${header}.${payload}`))).toBe(true);
  expect(result.public).toEqual({ property:"123" });
  expect(result.label).not.toContain("PRIVATE KEY");
  expect(result.secret.credentials).toBe(json);
});

test("GA4 uses report totals for unique users and fills missing daily visits with zero", async () => {
  const ctx = fakeContext({
    "https://oauth2.googleapis.com/token": { access_token:"test" },
    [api]: (init) => JSON.parse(init!.body!).dimensions ? { rows:[{dimensionValues:[{value:"20260918"}],metricValues:[{value:"18"}]}] } : {rows:[{metricValues:[{value:"10"},{value:"18"},{value:"32"}]}]},
  },{today:"2026-09-20"});
  const result = await connector.fetch({ secret:{property:"123",credentials:json}, public:{property:"123"},params:{},metrics:["users-30d","sessions-daily"] },ctx);
  expect(result["users-30d"]).toMatchObject({ value:10 });
  expect(result["sessions-daily"]).toMatchObject({ points:expect.arrayContaining([{t:"2026-09-18",v:18},{t:"2026-09-19",v:0}]) });
});

test("GA4 rejects wrong key types and never reflects provider error payloads", async () => {
  expect(()=>credentials('{"type":"authorized_user"}')).toThrow("service-account");
  const ctx = fakeContext({"https://oauth2.googleapis.com/token":()=>{throw new HttpError(403,"https://oauth2.googleapis.com/token","secret-provider-body");}});
  await expect(connector.connect!({property:"123",credentials:json},ctx)).rejects.toThrow("Viewer");
  await expect(connector.connect!({property:"G-123",credentials:json},ctx)).rejects.toThrow("numeric");
});
