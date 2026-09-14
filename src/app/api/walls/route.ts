import { NextResponse } from "next/server";
import { parseConfig } from "@/lib/config";
import { createWall } from "@/lib/store/walls";
import { toView } from "@/lib/wall-server";

/** Saves a new wallpaper. No account: the response carries the private links. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 8_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const config = parseConfig((body as { config?: unknown })?.config);
  if (!config) return NextResponse.json({ error: "invalid_config" }, { status: 422 });

  try {
    const wall = await createWall(config);
    console.log(`wall created ${wall.id} (${config.theme}, ${config.hero.kind})`);
    return NextResponse.json(toView(wall), { status: 201 });
  } catch (error) {
    console.error("create wall failed:", error);
    return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  }
}
