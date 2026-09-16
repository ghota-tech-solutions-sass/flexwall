import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";

/** Pays for one more connected account: a checkout the first time, a larger subscription afterwards. */
export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { acceptedTerms } = await readJson<{ acceptedTerms?: unknown }>(req);
    return NextResponse.json(await container().addPaidAccount.execute({ userId, acceptedTerms: acceptedTerms === true }));
  });
