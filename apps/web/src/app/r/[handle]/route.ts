import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/composition";
import { Handle } from "@/domain/handle";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE_S } from "@/domain/referral";
import { isProduction } from "@/infrastructure/env";
import { HTTP_STATUS } from "@/presentation/json";
import { ROUTES } from "@/presentation/routes";

/** An invite link: remembers who sent it for the next sign-up, then shows the site. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const c = container();
  const response = NextResponse.redirect(`${c.appUrl}${ROUTES.home}`, HTTP_STATUS.temporaryRedirect);
  const { handle } = await params;
  if (!Handle.isValid(handle)) return response;
  response.cookies.set(REFERRAL_COOKIE, Handle.parse(handle), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: ROUTES.home,
    maxAge: REFERRAL_COOKIE_MAX_AGE_S,
  });
  return response;
}
