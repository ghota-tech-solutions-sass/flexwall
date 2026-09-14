import { NextResponse } from "next/server";
import type { BillingPlan } from "@/application/ports";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";

const PLANS: BillingPlan[] = ["monthly", "yearly", "lifetime"];

export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { plan, acceptedTerms } = await readJson<{ plan?: string; acceptedTerms?: unknown }>(req);
    const chosen = PLANS.find((p) => p === plan) ?? "monthly";
    return NextResponse.json(await container().startCheckout.execute({ userId, plan: chosen, acceptedTerms: acceptedTerms === true }));
  });
