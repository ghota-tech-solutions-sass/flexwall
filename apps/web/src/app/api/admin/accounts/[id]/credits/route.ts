import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, sessionUserId } from "@/presentation/http";

type Params = { params: Promise<{ id: string }> };

/** Adds credits to an account, or takes some back with a negative amount. Administrators only. */
export const POST = (req: Request, { params }: Params) =>
  handle(async () => {
    const { amount, note } = await readJson<{ amount?: unknown; note?: string }>(req);
    const result = await container().adjustCredits.execute({ userId: await sessionUserId(), accountId: (await params).id, amount: Number(amount), note: String(note ?? "") });
    return NextResponse.json(result);
  });
