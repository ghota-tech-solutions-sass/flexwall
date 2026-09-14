import { NextResponse } from "next/server";
import { parseConfig } from "@/lib/config";
import { authorizeOwner, IMAGE_HEADERS, previewWidth, renderPng } from "@/lib/wall-server";

/**
 * The editor's live preview of unsaved changes, with the wall's connections.
 * POST with the edit key in a header, never a query string: the key would
 * otherwise sit in request logs next to every preview.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wall = await authorizeOwner(req, (await params).id);
  if (wall instanceof NextResponse) return wall;
  let body: { config?: unknown; width?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const config = parseConfig(body.config);
  if (!config) return new Response("invalid_config", { status: 422, headers: IMAGE_HEADERS });
  return renderPng({ config, mode: "owner", wall, watermark: !wall.pro, width: previewWidth(body.width) });
}
