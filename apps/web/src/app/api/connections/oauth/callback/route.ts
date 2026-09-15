import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { clearPendingSignIn, PENDING_SIGN_IN_COOKIE, sessionUserId } from "@/presentation/http";
import { CONNECT_PARAMS, ROUTES } from "@/presentation/routes";

/** A path with one more query parameter, keeping the ones it had. */
function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, "https://flexwall.invalid");
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

/**
 * Where providers send the owner back. Always answers with a redirect to the
 * page the owner started from: with the new connection's id, or with the
 * sentence saying why it didn't work.
 */
export async function GET(req: NextRequest) {
  const c = container();
  const pending = req.cookies.get(PENDING_SIGN_IN_COOKIE)?.value;
  const back = c.finishConnectionSignIn.returnPathOf(pending, ROUTES.settings);
  const userId = await sessionUserId();
  if (!userId) return NextResponse.redirect(`${c.appUrl}${ROUTES.login}`);

  let target: string;
  try {
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { connection, returnTo } = await c.finishConnectionSignIn.execute({ userId, pending, query });
    target = withParam(returnTo, CONNECT_PARAMS.connected, connection.id);
  } catch (error) {
    if (!(error instanceof DomainError)) console.error(error);
    const message = error instanceof DomainError ? error.message : "Something broke on our side. Try connecting again in a moment.";
    target = withParam(back, CONNECT_PARAMS.error, message);
  }
  const response = NextResponse.redirect(`${c.appUrl}${target}`);
  clearPendingSignIn(response);
  return response;
}
