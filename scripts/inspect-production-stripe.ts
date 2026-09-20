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
console.log(JSON.stringify({ accountId: account.id, displayName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null, currency: account.default_currency, keyKind: key.startsWith("rk_") ? "restricted" : "secret", live: true, flexwallProducts: products.data.filter((p: { name: string; metadata?: { app?: string } }) => p.metadata?.app === "flexwall" || /^Flexwall\b/i.test(p.name)).map((p: { id: string; name: string; active: boolean; metadata?: { app?: string } }) => ({ id: p.id, name: p.name, active: p.active, app: p.metadata?.app ?? null })), moreProducts: products.has_more }, null, 2));
