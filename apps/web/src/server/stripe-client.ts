import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

/**
 * Lazy Stripe singleton (lettrio convention): reads STRIPE_SECRET_KEY on
 * first use so the module can be imported anywhere without crashing when
 * the secret isn't mounted yet.
 */
let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_client) {
    _client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return _client;
}
