import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, requireUserId } from "@/presentation/http";

/** Replaces the lock screen image link; the old one stops working. */
export const POST = () => handle(async () => NextResponse.json(await container().rotateLockscreenLink.execute({ userId: await requireUserId() })));
