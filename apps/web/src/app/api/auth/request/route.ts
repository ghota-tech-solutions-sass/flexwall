import { NextResponse } from "next/server";
import { container } from "@/composition";
import { isProduction } from "@/infrastructure/env";
import { handle, readJson } from "@/presentation/http";

/** Mails a sign-in link. In local development without a mailer, the link is also returned to the page. */
export const POST = (req: Request) =>
  handle(async () => {
    const { email, handle } = await readJson<{ email?: string; handle?: string }>(req);
    const c = container();
    const { link } = await c.requestSignInLink.execute({ email: String(email ?? ""), handle: handle ? String(handle) : undefined });
    const devLink = c.mailerIsConsole && !isProduction() ? link : undefined;
    return NextResponse.json({ sent: true, devLink });
  });
