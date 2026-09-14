import { NextResponse } from "next/server";
import { container } from "@/composition";
import { STRIPE_SIGNATURE_HEADER } from "@/infrastructure/billing/stripe-gateway";
import { HTTP_STATUS } from "@/presentation/json";

/** What the webhook answers when it refuses or fails a delivery. Stripe retries 5xx, never 4xx. */
const WEBHOOK_ERRORS = { missingSignature: "missing_signature", invalidSignature: "invalid_signature", storeUnavailable: "store_unavailable" } as const;

/** Stripe billing events. Raw body first: the signature covers the exact bytes. Store errors answer 5xx so Stripe retries. */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get(STRIPE_SIGNATURE_HEADER);
  if (!signature) return NextResponse.json({ error: WEBHOOK_ERRORS.missingSignature }, { status: HTTP_STATUS.badRequest });
  const c = container();
  let event;
  try {
    event = await c.payments.parseEvent(body, signature);
  } catch (error) {
    console.error("stripe webhook rejected:", (error as Error).message);
    return NextResponse.json({ error: WEBHOOK_ERRORS.invalidSignature }, { status: HTTP_STATUS.badRequest });
  }
  if (!event) return NextResponse.json({ received: true });
  try {
    const result = await c.applyBillingEvent.execute(event);
    console.log(`billing event ${event.id} (${event.type}): ${result}`);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("billing event failed:", error);
    return NextResponse.json({ error: WEBHOOK_ERRORS.storeUnavailable }, { status: HTTP_STATUS.internal });
  }
}
