import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/composition";
import { setSession } from "@/presentation/http";

/** The link from the email: signs in, then sends new accounts to pick a handle. */
export async function GET(req: NextRequest) {
  const c = container();
  try {
    const { user, session } = await c.signIn.execute({ token: req.nextUrl.searchParams.get("token") ?? "", timeZone: req.nextUrl.searchParams.get("tz") ?? undefined });
    const response = NextResponse.redirect(`${c.appUrl}${user.handle ? "/edit" : "/onboarding"}`);
    setSession(response, session);
    return response;
  } catch {
    return NextResponse.redirect(`${c.appUrl}/login?expired=1`);
  }
}
