import { ConnectorError, HttpError, defineConnector, definePlugin, field, number, series, type ConnectorContext, type FetchResult } from "@flexwall/sdk";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const encoded = (value: object) => b64(encoder.encode(JSON.stringify(value)));

export function credentials(raw: string): { email: string; key: string } {
  try {
    const data = JSON.parse(raw);
    if (data.type !== "service_account" || typeof data.client_email !== "string" || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(data.client_email) || typeof data.private_key !== "string" || !data.private_key.includes("-----BEGIN PRIVATE KEY-----")) throw new Error();
    return { email: data.client_email, key: data.private_key };
  } catch { throw new ConnectorError("Paste a valid Google service-account JSON key. OAuth client keys and measurement IDs are not supported."); }
}

async function accessToken(raw: string, ctx: ConnectorContext) {
  const { email, key } = credentials(raw);
  let assertion: string;
  try {
    const der = Uint8Array.from(atob(key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
    const signingKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const now = Math.floor(Date.now() / 1000);
    const input = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, encoder.encode(input));
    assertion = `${input}.${b64(new Uint8Array(signature))}`;
  } catch { throw new ConnectorError("Google's private key could not be read. Download a new service-account JSON key."); }
  const result = await ctx.fetch.json<{ access_token?: string }>(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  if (!result.access_token) throw new ConnectorError("Google did not issue an access token. Check the service-account key.");
  return result.access_token;
}

export function reportingDays(today: string): string[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: 30 }, (_, i) => new Date(end - (30 - i) * 86400000).toISOString().slice(0, 10));
}
interface Report { rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[]; }
const propertyId = (raw: unknown) => {
  const id = String(raw ?? "").trim();
  if (!/^[1-9]\d{0,14}$/.test(id)) throw new ConnectorError("Use the numeric GA4 property ID, not the G- measurement ID.");
  return id;
};
const metricValue = (raw: string | undefined) => {
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ConnectorError("Google returned an invalid traffic metric.");
  return value;
};

async function read(secret: Record<string, string>, metrics: string[], ctx: ConnectorContext): Promise<FetchResult> {
  const property = propertyId(secret.property);
  try {
    const token = await accessToken(secret.credentials, ctx);
    const days = reportingDays(ctx.today);
    const query = (daily: boolean) => ctx.fetch.json<Report>(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: days[0], endDate: days.at(-1) }], metrics: (daily ? ["sessions"] : ["totalUsers", "sessions", "screenPageViews"]).map((name) => ({ name })), ...(daily ? { dimensions: [{ name: "date" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: "30" } : {}) }),
    });
    const out: FetchResult = {};
    if (metrics.some((m) => m !== "sessions-daily")) {
      const report = await query(false);
      const totals = report.rows?.[0]?.metricValues;
      ["users-30d", "sessions-30d", "pageviews-30d"].forEach((id, index) => { out[id] = number(metricValue(totals?.[index]?.value), { unit: "count" }); });
    }
    if (metrics.includes("sessions-daily")) {
      const report = await query(true);
      const byDate = new Map((report.rows ?? []).map((row) => {
        const date = row.dimensionValues?.[0]?.value ?? "";
        return [`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, metricValue(row.metricValues[0]?.value)];
      }));
      out["sessions-daily"] = series(days.map((t) => ({ t, v: byDate.get(t) ?? 0 })), { unit: "count" });
    }
    return out;
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw new ConnectorError("Google refused access. Enable the Analytics Data API and add the service-account email as a Viewer on this GA4 property.");
    if (error instanceof HttpError && error.status === 429) throw new ConnectorError("Google Analytics quota reached. Try again later.");
    throw new ConnectorError("Google Analytics could not be read. Check the property ID, key and API access.");
  }
}

export const googleAnalyticsConnector = defineConnector({
  id: "google-analytics", name: "Google Analytics", homepage: "https://analytics.google.com", description: "GA4 users, visits and pageviews over the last 30 complete days.", tier: "pro", verified: true, ttl: 900,
  auth: {
    label: "Connect Google Analytics",
    help: "Enable the Google Analytics Data API in your Google Cloud project. Create a service account, then add its email as a Viewer in GA4 → Admin → Property access management. Paste its JSON key below. Use a dedicated account with access only to the property you want to share. Reports cover the last 30 complete days; today's partial data is excluded.",
    fields: [field.text("property", "GA4 property ID", { placeholder: "123456789", maxLength: 15, pattern: "^[1-9][0-9]{0,14}$", patternMessage: "must be a numeric property ID, not a G- measurement ID" }), field.secret("credentials", "Service-account JSON key", { maxLength: 10000, placeholder: '{"type":"service_account", …}' })],
  },
  metrics: [
    { id: "users-30d", name: "Unique users, last 30 days", type: "number", unit: "count", defaults: { label: "Users, 30 days" }, leaderboard: "audience" },
    { id: "sessions-30d", name: "Visits (sessions), last 30 days", type: "number", unit: "count", defaults: { label: "Visits, 30 days" } },
    { id: "pageviews-30d", name: "Pageviews, last 30 days", type: "number", unit: "count", defaults: { label: "Pageviews, 30 days" } },
    { id: "sessions-daily", name: "Daily visits, last 30 days", type: "series", unit: "count", defaults: { label: "Daily visits" } },
  ],
  cacheKey: () => "property",
  async connect(input, ctx) {
    const secret = { property: propertyId(input.property), credentials: String(input.credentials ?? "") };
    credentials(secret.credentials);
    await read(secret, ["users-30d"], ctx);
    return { secret, public: { property: secret.property }, label: `GA4 · ${secret.property}`, accountId: secret.property };
  },
  async fetch({ secret, metrics }, ctx) { return secret ? read(secret, metrics, ctx) : {}; },
  sample: { "users-30d": number(12480, { unit: "count" }), "sessions-30d": number(18360, { unit: "count" }), "pageviews-30d": number(42750, { unit: "count" }), "sessions-daily": series(reportingDays(new Date().toISOString().slice(0, 10)).map((t, i) => ({ t, v: 322 + i * 20 })), { unit: "count" }) },
});

export default definePlugin({ id: "google-analytics", name: "Google Analytics", description: "Traffic from Google Analytics 4.", author: { name: "Flexwall", url: "https://flexwall.lol" }, connectors: [googleAnalyticsConnector] });
