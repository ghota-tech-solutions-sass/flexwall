import { execFileSync } from "node:child_process";

// Operator-only read. Credentials stay in process memory and are never logged.
const key = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=outflex-stripe-secret-key", "--project=ghota-outflex-prod"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
if (!/^(sk|rk)_live_/.test(key)) throw new Error("The configured Stripe credential is not a live-mode key. Nothing was changed.");
async function get(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Stripe read failed (HTTP ${response.status}).`);
  return response.json();
}
const account = await get("/account");
const products = await get("/products?limit=100");
console.log(JSON.stringify({ accountId: account.id, displayName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null, currency: account.default_currency, keyKind: key.startsWith("rk_") ? "restricted" : "secret", live: true, flexwallProducts: products.data.filter((p: { name: string; metadata?: { app?: string } }) => p.metadata?.app === "flexwall" || /^Flexwall\b/i.test(p.name)).map((p: { id: string; name: string; active: boolean; metadata?: { app?: string } }) => ({ id: p.id, name: p.name, active: p.active, app: p.metadata?.app ?? null })), otherProducts: products.data.filter((p: { name: string; metadata?: { app?: string } }) => p.metadata?.app !== "flexwall" && !/^Flexwall\b/i.test(p.name)).map((p: { name: string }) => p.name), moreProducts: products.has_more }, null, 2));

// Verify the same reader used by production, without writing any Stripe object.
const service = JSON.parse(execFileSync("gcloud", ["run", "services", "describe", "flexwall", "--region=europe-west1", "--project=ghota-outflex-prod", "--format=json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const monthly = service.spec.template.spec.containers[0].env.find((entry: { name: string }) => entry.name === "STRIPE_PRICE_MONTHLY")?.value;
process.env.STRIPE_SECRET_KEY = key;
process.env.STRIPE_PRICE_MONTHLY = monthly ?? "";
try {
  const { officialStripeStats } = await import("../apps/web/src/infrastructure/billing/official-stripe");
  const report = await officialStripeStats();
  console.log(JSON.stringify({ mode: report.mode, mrr: report.values.mrr, activeSubscriptions: report.values.subscribers, revenue30d: report.values.revenue30d, dailyPoints: report.values["revenue-daily"].type === "series" ? report.values["revenue-daily"].points.length : 0 }, null, 2));
} catch (error) {
  console.error("Live reporting validation failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
