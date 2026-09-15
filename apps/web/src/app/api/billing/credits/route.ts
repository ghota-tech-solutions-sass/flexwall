import { NextResponse } from "next/server";
import { container } from "@/composition";
import { isCreditPack, SUGGESTED_CREDIT_PACK } from "@/domain/credits";
import { handle, readJson, requireUserId } from "@/presentation/http";

/** Opens the payment of a credit pack. */
export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { pack, acceptedTerms } = await readJson<{ pack?: string; acceptedTerms?: unknown }>(req);
    const chosen = isCreditPack(pack) ? pack : SUGGESTED_CREDIT_PACK;
    return NextResponse.json(await container().startCreditsCheckout.execute({ userId, pack: chosen, acceptedTerms: acceptedTerms === true }));
  });
