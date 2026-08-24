import { type NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/client";
import { publicOrigin, stripeEnabled } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Retour de checkout. Vérifie la session côté serveur (jamais confiance au
 * client), pose le cookie signé "my seat" et redirige vers /me.
 * Sans clé Stripe (démo) : redirection simple vers l'accueil.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!stripeEnabled() || !sessionId) {
    return NextResponse.redirect(`${origin}/`);
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // "no_payment_required" = fully discounted by a promo code, still a valid entry.
    const settled = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!settled || !session.metadata?.slug) {
      return NextResponse.redirect(`${origin}/?checkout=unpaid`);
    }

    const res = NextResponse.redirect(`${origin}/me?welcome=1`);
    res.cookies.set(SESSION_COOKIE, createSessionToken(session.metadata.slug), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (error) {
    // Session introuvable (id forgé ou réseau) — on ne révèle rien.
    console.error("entered verification failed:", error);
    return NextResponse.redirect(`${origin}/?checkout=unknown`);
  }
}
