import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, sessionUserId } from "@/presentation/http";

/** Publishes, unpublishes, lists or unlists an account's wall. Administrators only. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { published, listed } = await readJson<{ published?: unknown; listed?: unknown }>(req);
    const wall = await container().moderateWall.execute({
      userId: await sessionUserId(),
      accountId: (await params).id,
      published: typeof published === "boolean" ? published : undefined,
      listed: typeof listed === "boolean" ? listed : undefined,
    });
    return NextResponse.json({ wall });
  });
