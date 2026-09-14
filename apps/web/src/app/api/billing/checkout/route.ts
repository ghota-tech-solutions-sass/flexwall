import { NextResponse } from "next/server";
import { container } from "@/composition";
import { DEFAULT_BILLING_PLAN, isBillingPlan } from "@/domain/pricing";
import { handle, readJson, requireUserId } from "@/presentation/http";

export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { plan, acceptedTerms } = await readJson<{ plan?: string; acceptedTerms?: unknown }>(req);
    const chosen = isBillingPlan(plan) ? plan : DEFAULT_BILLING_PLAN;
    return NextResponse.json(await container().startCheckout.execute({ userId, plan: chosen, acceptedTerms: acceptedTerms === true }));
  });
