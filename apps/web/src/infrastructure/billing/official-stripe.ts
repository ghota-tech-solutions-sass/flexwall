import Stripe from "stripe";
import { readAccount } from "@flexwall/plugin-stripe";
import { GuardedRuntime } from "@/infrastructure/system";

export const OFFICIAL_STRIPE_ACCOUNT = "acct_1U7NFI601gQlsn4H";
/** Fail closed if billing is moved to another account or that account stops being dedicated to Flexwall. */
export function validateOfficialStripe(account: { id: string }, products: { data: { name: string; metadata?: { app?: string } }[]; has_more: boolean }) {
  if (account.id !== OFFICIAL_STRIPE_ACCOUNT || products.has_more || !products.data.length || products.data.some((p) => p.metadata?.app !== "flexwall" && !/^Flexwall\b/i.test(p.name))) throw new Error("Official Stripe statistics are unavailable.");
}

/** Uses the already-configured billing credential server-side; never copies it into a wall or connector. */
export async function officialStripeStats() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const monthlyPrice = process.env.STRIPE_PRICE_MONTHLY?.trim();
  if (!key || !/^(sk|rk)_live_/.test(key) || !monthlyPrice) throw new Error("Official live Stripe reporting is not configured.");
  const stripe = new Stripe(key);
  const [account, products, price] = await Promise.all([stripe.accounts.retrieve(null), stripe.products.list({ limit: 100 }), stripe.prices.retrieve(monthlyPrice)]);
  validateOfficialStripe(account, products);
  if (!price.livemode || !products.data.some((p) => p.id === price.product)) throw new Error("Official Stripe price does not belong to Flexwall.");
  const context = new GuardedRuntime([]).context(new Date().toISOString().slice(0, 10));
  // MRR is in the subscription price currency. Receipts are in the settlement currency; no invented FX conversion.
  const [recurring, revenue] = await Promise.all([
    readAccount(key, context, new Set(["mrr", "subscribers"]), price.currency),
    readAccount(key, context, new Set(["revenue30d", "revenue-daily"]), account.default_currency),
  ]);
  return { mode: "live" as const, updatedAt: new Date().toISOString(), values: { ...recurring.values, ...revenue.values } };
}
