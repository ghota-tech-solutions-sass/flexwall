import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, sessionUserId } from "@/presentation/http";

type Params = { params: Promise<{ id: string }> };

/** Gives an account connected accounts free of charge, or takes them back. Administrators only. */
export const POST = (req: Request, { params }: Params) =>
  handle(async () => {
    const { accounts } = await readJson<{ accounts?: unknown }>(req);
    const result = await container().grantPaidAccounts.execute({ userId: await sessionUserId(), accountId: (await params).id, accounts: Number(accounts) });
    return NextResponse.json(result);
  });
