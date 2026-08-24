import { type NextRequest, NextResponse } from "next/server";
import { avatarFor } from "@/lib/store/entries";

export const dynamic = "force-dynamic";

/** Serves the avatar stored at credit time. The browser never talks to a third party. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9_]{2,30}$/.test(slug)) return new NextResponse(null, { status: 404 });
  try {
    const avatar = await avatarFor(slug);
    if (!avatar) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(avatar.bytes), {
      headers: {
        "content-type": avatar.type,
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
