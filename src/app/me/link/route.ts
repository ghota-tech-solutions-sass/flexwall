import { type NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, verifyMagicToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Magic link landing: exchange the emailed token for the session cookie. */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const slug = verifyMagicToken(req.nextUrl.searchParams.get("token") ?? undefined);
  if (!slug) return NextResponse.redirect(`${origin}/me?link=expired`);

  const res = NextResponse.redirect(`${origin}/me`);
  res.cookies.set(SESSION_COOKIE, createSessionToken(slug), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
