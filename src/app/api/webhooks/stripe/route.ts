import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { creditEntry, listEntries, payerEmailFor, setEnrichment } from "@/lib/store/entries";
import { enrichIdentity } from "@/lib/enrich";
import { makeIdentity, rankEntries } from "@/lib/board";
import { getStripeClient } from "@/lib/stripe/client";
import { publicOrigin, requireEnv } from "@/lib/env";
import { getEmailSender } from "@/lib/email";
import { passedMail, welcomeMail } from "@/lib/mail-templates";
import { createMagicToken, WELCOME_LINK_TTL_MS } from "@/lib/session";
import { xIntentUrl } from "@/lib/share";

/**
 * checkout.session.completed → crédite le slug.
 *
 * Le raw body est requis pour la vérification de signature — ne jamais parser
 * avant constructEvent. Les erreurs de store retournent 500 pour que Stripe
 * retente ; le crédit est idempotent par event.id (journal `events`).
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    console.error("webhook verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // "no_payment_required": 100% promo code. Still an entry.
    const settled = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (settled) {
      const identity = makeIdentity(session.metadata?.slug ?? "");
      // Credit the DECLARED amount (before promo discount): that is what the
      // wall ranks. amount_total is what the card was charged.
      const amountUSD = (session.amount_subtotal ?? session.amount_total ?? 0) / 100;
      const chargedUSD = (session.amount_total ?? 0) / 100;
      if (identity && amountUSD > 0) {
        try {
          // Nom affiché : celui des metadata si présent (premier paiement),
          // sinon dérivé du slug (top-up sans nom — ne devrait pas arriver).
          const displayName = session.metadata?.name?.trim() || identity.slug;
          // Email collecté par Stripe au checkout — privé, sert au lookup /me.
          const payerEmail = session.customer_details?.email ?? undefined;
          const credited = await creditEntry(identity.slug, displayName, amountUSD, payerEmail, event.id);
          if (credited) {
            console.log(
              `credited ${identity.slug} (${displayName}) +$${amountUSD}` +
                (chargedUSD !== amountUSD ? ` (charged $${chargedUSD}, promo applied)` : "")
            );
            if (credited.type === "entry") {
              // Avatar X / description du site : une fois, à la création de la place.
              try {
                await setEnrichment(identity.slug, await enrichIdentity(displayName));
              } catch (error) {
                console.error("enrichment failed:", error);
              }
            }
            if (payerEmail) await sendWelcome(req, identity.slug, displayName, payerEmail);
            await notifyPassed(req, identity.slug, displayName, credited.newTotalUSD - credited.amountUSD, credited.newTotalUSD);
          } else {
            console.log(`duplicate webhook ${event.id} ignored`);
          }
        } catch (error) {
          console.error("credit failed:", error);
          return NextResponse.json({ error: "store_unavailable" }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}

/** Welcome mail with the way back to /me. Never fails the webhook. */
async function sendWelcome(req: NextRequest, slug: string, name: string, to: string): Promise<void> {
  const sender = getEmailSender();
  if (!sender) return;
  try {
    const ranked = rankEntries(await listEntries());
    const idx = ranked.findIndex((e) => e.slug === slug);
    if (idx === -1) return;
    const origin = publicOrigin(req);
    const shareUrl = `${origin}/share/${slug}`;
    await sender(
      welcomeMail(to, {
        name,
        rank: idx + 1,
        total: ranked.length,
        amountUSD: ranked[idx].amountUSD,
        link: `${origin}/me/link?token=${createMagicToken(slug, WELCOME_LINK_TTL_MS)}`,
        shareUrl,
        xUrl: xIntentUrl({ rank: idx + 1, amountUSD: ranked[idx].amountUSD, url: shareUrl }),
      })
    );
  } catch (error) {
    console.error("welcome mail failed:", error);
  }
}

/**
 * "You've been passed" : préviens les places dépassées par ce paiement
 * (ancien total < leur montant < nouveau total). Cap à 10 mails par événement
 * (quota Workspace) en privilégiant les plus grosses places. Jamais bloquant.
 */
async function notifyPassed(req: NextRequest, bySlug: string, byName: string, oldTotal: number, newTotal: number): Promise<void> {
  const sender = getEmailSender();
  if (!sender) return;
  try {
    const ranked = rankEntries(await listEntries());
    const passed = ranked
      .filter((e) => e.slug !== bySlug && e.amountUSD > oldTotal && e.amountUSD < newTotal)
      .slice(0, 10);
    const origin = publicOrigin(req);
    for (const seat of passed) {
      const email = await payerEmailFor(seat.slug);
      if (!email) continue;
      const newRank = ranked.findIndex((x) => x.slug === seat.slug) + 1;
      await sender(
        passedMail(email, {
          name: seat.name,
          byName,
          byAmountUSD: newTotal,
          newRank,
          total: ranked.length,
          toReclaimUSD: newTotal - seat.amountUSD + 1,
          link: `${origin}/me/link?token=${createMagicToken(seat.slug, WELCOME_LINK_TTL_MS)}`,
        })
      );
      console.log(`passed mail sent for ${seat.slug} (passed by ${bySlug})`);
    }
  } catch (error) {
    console.error("passed notifications failed:", error);
  }
}
