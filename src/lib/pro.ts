import type Stripe from "stripe";
import { getEmailSender } from "@/lib/email";
import { proMail } from "@/lib/mail";
import { SITE_URL } from "@/lib/site";
import { toView } from "@/lib/wall-server";
import { getWall, markPro } from "@/lib/store/walls";

/**
 * One place that turns a completed Checkout Session into a Pro wall. Called by
 * the webhook and by the success redirect (whichever lands first); the
 * idempotency key is the session id, so both paths unlock exactly once.
 */
export async function unlockFromSession(session: Stripe.Checkout.Session): Promise<"unlocked" | "already" | "unpaid" | "unknown_wall"> {
  const settled = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!settled) return "unpaid";
  const wallId = session.metadata?.wallId;
  if (!wallId) return "unknown_wall";
  const email = session.customer_details?.email ?? undefined;
  const first = await markPro(wallId, `checkout:${session.id}`, email);
  if (!first) {
    const wall = await getWall(wallId);
    return wall ? "already" : "unknown_wall";
  }
  console.log(`wall ${wallId} unlocked Pro (${session.id})`);
  if (email) await sendReceipt(wallId, email);
  return "unlocked";
}

/** The edit link by mail: the only way back to a wall from another browser. Never throws. */
async function sendReceipt(wallId: string, to: string): Promise<void> {
  const sender = getEmailSender();
  if (!sender) return;
  try {
    const wall = await getWall(wallId);
    if (!wall) return;
    const view = toView(wall);
    await sender(proMail(to, { editUrl: SITE_URL + view.editPath, imageUrl: SITE_URL + view.imagePath }));
  } catch (error) {
    console.error("receipt mail failed:", error);
  }
}
