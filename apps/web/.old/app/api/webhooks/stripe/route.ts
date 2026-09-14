import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { unlockFromSession } from "@/lib/pro";
import { getStripeClient } from "@/lib/stripe/client";

/**
 * checkout.session.completed → Pro. Raw body first: the signature covers the
 * exact bytes. Store errors answer 500 so Stripe retries; the unlock itself is
 * idempotent per session.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // Async: under Bun, Stripe picks the WebCrypto provider, which has no sync HMAC.
    event = await getStripeClient().webhooks.constructEventAsync(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    console.error("webhook verification failed:", error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      const result = await unlockFromSession(event.data.object as Stripe.Checkout.Session);
      console.log(`webhook ${event.id}: ${result}`);
    } catch (error) {
      console.error("unlock failed:", error);
      return NextResponse.json({ error: "store_unavailable" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
