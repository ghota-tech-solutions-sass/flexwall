import type { NextRequest } from "next/server";
import { decodeConfig } from "@/lib/config";
import { IMAGE_HEADERS, renderPng } from "@/lib/wall-server";

/**
 * Editor preview of an unsaved config. Always watermarked and capped well
 * below phone resolution, so it can't stand in for the paid image.
 */
export async function GET(req: NextRequest) {
  const config = decodeConfig(req.nextUrl.searchParams.get("c") ?? "");
  if (!config) return new Response("invalid_config", { status: 422, headers: IMAGE_HEADERS });
  const w = Number(req.nextUrl.searchParams.get("w") ?? "402");
  const width = Math.max(200, Math.min(603, Number.isFinite(w) ? w : 402));
  const sample = req.nextUrl.searchParams.get("sample") === "1";
  return renderPng(config, { watermark: true, width, sample });
}
