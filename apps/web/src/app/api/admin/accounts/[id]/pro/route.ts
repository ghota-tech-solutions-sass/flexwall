import { NextResponse } from "next/server";
import { container } from "@/composition";
import type { ComplimentaryTerm } from "@/domain/admin";
import { handle, readJson, sessionUserId } from "@/presentation/http";

type Params = { params: Promise<{ id: string }> };

/** Offers Pro to an account for a term, free of charge. Administrators only. */
export const POST = (req: Request, { params }: Params) =>
  handle(async () => {
    const { term, note } = await readJson<{ term?: string; note?: string }>(req);
    const account = await container().offerPro.execute({ userId: await sessionUserId(), accountId: (await params).id, term: term as ComplimentaryTerm, note: String(note ?? "") });
    return NextResponse.json({ account });
  });

/** Takes offered Pro back. Administrators only. */
export const DELETE = (req: Request, { params }: Params) =>
  handle(async () => {
    await readJson<unknown>(req);
    const account = await container().withdrawPro.execute({ userId: await sessionUserId(), accountId: (await params).id });
    return NextResponse.json({ account });
  });
