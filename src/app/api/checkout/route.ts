import { NextResponse } from "next/server";
import { publicOrigin, stripeEnabled } from "@/lib/env";
import { PRO_PRICE_CENTS } from "@/lib/site";
import { getStripeClient } from "@/lib/stripe/client";
import { authorizeOwner } from "@/lib/wall-server";

/** Hosted Checkout for Pro. Only the owner (edit key) can start it. */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  let id = "";
  try {
    id = String(((await req.json()) as { id?: unknown }).id ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const wall = await authorizeOwner(req, id);
  if (wall instanceof NextResponse) return wall;
  if (wall.pro) return NextResponse.json({ error: "already_pro" }, { status: 409 });

  const origin = publicOrigin(req);
  try {
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRO_PRICE_CENTS,
            product_data: {
              name: "Flexwall Pro",
              description: "Every theme, no watermark, a spot in the gallery. One wallpaper, forever.",
            },
          },
        },
      ],
      metadata: { wallId: wall.id },
      payment_intent_data: { metadata: { wallId: wall.id } },
      // The edit key stays in the browser: the page it returns to already has it.
      success_url: `${origin}/edit/${wall.id}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/edit/${wall.id}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("checkout failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
