import { NextResponse } from "next/server";
import { container } from "@/composition";

/** Stripe billing events. Raw body first: the signature covers the exact bytes. Store errors answer 5xx so Stripe retries. */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const c = container();
  let event;
  try {
    event = await c.payments.parseEvent(body, signature);
  } catch (error) {
    console.error("stripe webhook rejected:", (error as Error).message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ received: true });
  try {
    const result = await c.applyBillingEvent.execute(event);
    console.log(`billing event ${event.id} (${event.type}): ${result}`);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("billing event failed:", error);
    return NextResponse.json({ error: "store_unavailable" }, { status: 500 });
  }
}
