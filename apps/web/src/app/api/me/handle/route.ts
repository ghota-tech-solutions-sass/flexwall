import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";

export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { handle: wanted } = await readJson<{ handle?: string }>(req);
    const wall = await container().claimHandle.execute({ userId, handle: String(wanted ?? "") });
    return NextResponse.json({ handle: wall.handle });
  });
