import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/composition";
import { REFERRAL_COOKIE } from "@/domain/referral";
import { setSession } from "@/presentation/http";
import { ROUTES, SIGN_IN_PARAMS } from "@/presentation/routes";

/** The link from the email: signs in, then sends new accounts to pick a handle. */
export async function GET(req: NextRequest) {
  const c = container();
  try {
    const { user, session } = await c.signIn.execute({
      token: req.nextUrl.searchParams.get(SIGN_IN_PARAMS.token) ?? "",
      timeZone: req.nextUrl.searchParams.get(SIGN_IN_PARAMS.timeZone) ?? undefined,
      referralHandle: req.cookies.get(REFERRAL_COOKIE)?.value,
    });
    const response = NextResponse.redirect(`${c.appUrl}${user.handle ? ROUTES.edit : ROUTES.onboarding}`);
    setSession(response, session);
    // Used once: the invite only ever applies to the account it created.
    response.cookies.delete(REFERRAL_COOKIE);
    return response;
  } catch {
    return NextResponse.redirect(`${c.appUrl}${ROUTES.loginExpired}`);
  }
}
