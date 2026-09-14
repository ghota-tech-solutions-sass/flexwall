import { NextResponse } from "next/server";
import { cacheKeysForConnection } from "@/lib/metrics";
import { deleteConnection, getWall } from "@/lib/store/walls";
import { authorizeOwner, toView } from "@/lib/wall-server";

/** Forgets a connection: the sealed secret and every value fetched with it. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; conn: string }> }) {
  const { id, conn } = await params;
  const wall = await authorizeOwner(req, id);
  if (wall instanceof NextResponse) return wall;
  const stored = wall.connections?.[conn];
  if (!stored) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteConnection(wall.id, conn, cacheKeysForConnection(wall, stored.source, conn));
  console.log(`wall ${wall.id} removed connection ${conn} (${stored.source})`);
  return NextResponse.json(toView((await getWall(wall.id))!));
}
