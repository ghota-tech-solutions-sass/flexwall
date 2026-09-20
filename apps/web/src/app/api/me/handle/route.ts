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

/** Public availability only; ownership is never returned. Claiming still requires sign-in. */
export const GET = (req: Request) =>
  handle(async () => {
    const result = await container().checkHandle.execute(new URL(req.url).searchParams.get("handle") ?? "");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  });
