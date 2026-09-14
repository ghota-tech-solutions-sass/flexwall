import { NextResponse } from "next/server";
import { z } from "zod";
import { WallConfigSchema } from "@/lib/config";
import { updateWall } from "@/lib/store/walls";
import { authorizeOwner, toView } from "@/lib/wall-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const wall = await authorizeOwner(req, (await params).id);
  if (wall instanceof NextResponse) return wall;
  return NextResponse.json(toView(wall));
}

const PatchSchema = z.object({
  config: WallConfigSchema.optional(),
  public: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const wall = await authorizeOwner(req, (await params).id);
  if (wall instanceof NextResponse) return wall;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_config" }, { status: 422 });

  const updated = await updateWall(wall.id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(updated));
}
