import type { NextRequest } from "next/server";
import { decodeConfig } from "@/lib/config";
import { IMAGE_HEADERS, previewWidth, renderPng } from "@/lib/wall-server";

/**
 * Preview of a config nobody saved yet: the /new editor and the landing page
 * samples (`sample=1`, nothing fetched). Always watermarked and size-capped.
 */
export async function GET(req: NextRequest) {
  const config = decodeConfig(req.nextUrl.searchParams.get("c") ?? "");
  if (!config) return new Response("invalid_config", { status: 422, headers: IMAGE_HEADERS });
  const sample = req.nextUrl.searchParams.get("sample") === "1";
  return renderPng({ config, mode: sample ? "sample" : "anonymous", watermark: true, width: previewWidth(req.nextUrl.searchParams.get("w")) });
}
