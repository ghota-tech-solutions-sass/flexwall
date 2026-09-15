import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";
import { HTTP_STATUS } from "@/presentation/json";

export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const userId = await requireUserId();
    const { nickname } = await readJson<{ nickname?: unknown }>(req);
    const connection = await container().renameConnection.execute({ userId, connectionId: (await params).id, nickname: nickname ?? null });
    return NextResponse.json({ connection });
  });

export const DELETE = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    await container().removeConnection.execute({ userId: await requireUserId(), connectionId: (await params).id });
    return new NextResponse(null, { status: HTTP_STATUS.noContent });
  });
