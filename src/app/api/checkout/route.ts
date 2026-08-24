import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dynamicFloor, makeIdentity } from "@/lib/board";
import { listEntries } from "@/lib/store/entries";
import { getStripeClient } from "@/lib/stripe/client";
import { publicOrigin, stripeEnabled } from "@/lib/env";

const BodySchema = z.object({
  // Champ libre : @pseudo X, prénom nom, société… 2 à 40 caractères affichables.
  handle: z.string().min(2).max(40),
  amount: z.number().int().positive(),
});

/**
 * Hosted Checkout à montant libre : le montant posté EST le produit, chaque
 * session porte son propre price_data. Le slug (identité normalisée) et le
 * nom d'affichage voyagent dans les metadata et sont lus par le webhook.
 */
export async function POST(req: NextRequest) {
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const identity = makeIdentity(parsed.data.handle);
  if (!identity) {
    return NextResponse.json(
      { error: "name must contain at least 2 letters or digits" },
      { status: 422 }
    );
  }

  const amount = parsed.data.amount;
  // Plancher dynamique : il monte avec la taille du mur, mais ne s'applique
  // qu'aux nouveaux noms. Une place déjà payée se recharge du montant qu'on veut.
  const entries = await listEntries();
  const isTopUp = entries.some((e) => e.slug === identity.slug);
  const floor = dynamicFloor(entries.length);
  if (!isTopUp && amount < floor) {
    return NextResponse.json({ error: "below_minimum", floor }, { status: 422 });
  }
  // Sanity ceiling — les typos existent ; au-delà, un humain regarde.
  if (amount > 500_000_000) {
    return NextResponse.json({ error: "amount_above_ceiling" }, { status: 422 });
  }

  const appUrl = publicOrigin(req);

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Promo codes (Dashboard → Product catalog → Coupons → promotion code).
      // The wall credits the declared amount (amount_subtotal); the discount is
      // a marketing cost, not a smaller seat. A 100% code is allowed.
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount * 100,
            product_data: {
              name: identity.name + " · flexwall entry",
              description: "Non-refundable entry. Your rank is your amount.",
            },
          },
        },
      ],
      metadata: { slug: identity.slug, name: identity.name },
      payment_intent_data: { metadata: { slug: identity.slug, name: identity.name } },
      success_url: `${appUrl}/entered?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("checkout failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
