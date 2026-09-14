import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, requireUserId } from "@/presentation/http";
import { HTTP_STATUS } from "@/presentation/json";

export const DELETE = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    await container().removeConnection.execute({ userId: await requireUserId(), connectionId: (await params).id });
    return new NextResponse(null, { status: HTTP_STATUS.noContent });
  });
