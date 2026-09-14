import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, requireUserId } from "@/presentation/http";

export const POST = () => handle(async () => NextResponse.json(await container().openBillingPortal.execute({ userId: await requireUserId() })));
