import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/composition";
import { REFERRAL_COOKIE } from "@/domain/referral";
import { setSession } from "@/presentation/http";

/** The link from the email: signs in, then sends new accounts to pick a handle. */
export async function GET(req: NextRequest) {
  const c = container();
  try {
    const { user, session } = await c.signIn.execute({
      token: req.nextUrl.searchParams.get("token") ?? "",
      timeZone: req.nextUrl.searchParams.get("tz") ?? undefined,
      referralHandle: req.cookies.get(REFERRAL_COOKIE)?.value,
    });
    const response = NextResponse.redirect(`${c.appUrl}${user.handle ? "/edit" : "/onboarding"}`);
    setSession(response, session);
    // Used once: the invite only ever applies to the account it created.
    response.cookies.delete(REFERRAL_COOKIE);
    return response;
  } catch {
    return NextResponse.redirect(`${c.appUrl}/login?expired=1`);
  }
}
