import { NextResponse } from "next/server";
import { updateWall } from "@/lib/store/walls";
import { newNonce } from "@/lib/tokens";
import { authorizeOwner, toView } from "@/lib/wall-server";

/** New image URL, old one dead. For a Shortcut link that got shared by mistake. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wall = await authorizeOwner(req, (await params).id);
  if (wall instanceof NextResponse) return wall;
  const updated = await updateWall(wall.id, { imgNonce: newNonce() });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(updated));
}
