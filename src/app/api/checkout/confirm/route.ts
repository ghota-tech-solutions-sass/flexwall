import { NextResponse } from "next/server";
import { stripeEnabled } from "@/lib/env";
import { unlockFromSession } from "@/lib/pro";
import { getStripeClient } from "@/lib/stripe/client";

/**
 * Called by the success page so Pro shows up immediately, without waiting for
 * the webhook. Trusts nothing from the browser but the session id: the wall
 * comes from the session's own metadata.
 */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  let sessionId = "";
  try {
    sessionId = String(((await req.json()) as { sessionId?: unknown }).sessionId ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }
  try {
    const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
    const result = await unlockFromSession(session);
    return NextResponse.json({ result, wallId: session.metadata?.wallId ?? null });
  } catch (error) {
    console.error("checkout confirm failed:", error);
    return NextResponse.json({ error: "confirm_failed" }, { status: 502 });
  }
}
