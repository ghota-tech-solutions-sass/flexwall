import { NextResponse } from "next/server";
import type { WallDraft } from "@/domain/wall";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";

export const GET = () =>
  handle(async () => {
    const owner = await container().getOwnerWall.execute({ userId: await requireUserId() });
    return NextResponse.json({ wall: owner.wall, entitlements: owner.entitlements, connections: owner.connections, lockscreenPath: owner.lockscreenPath });
  });

export const PUT = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const draft = await readJson<WallDraft>(req);
    const wall = await container().saveWall.execute({ userId, draft });
    return NextResponse.json({ wall });
  });
