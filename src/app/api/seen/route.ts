import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordSeatView } from "@/lib/store/entries";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ slug: z.string().regex(/^[a-z0-9_]{2,30}$/) });

/** POST /api/seen — beacon "cette place a été vue". Fire-and-forget côté client. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  await recordSeatView(parsed.data.slug);
  return NextResponse.json({ ok: true });
}
