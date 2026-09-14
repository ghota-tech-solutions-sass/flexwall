import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson } from "@/presentation/http";

/** Mails a sign-in link. In local development without a mailer, the link is also returned to the page. */
export const POST = (req: Request) =>
  handle(async () => {
    const { email } = await readJson<{ email?: string }>(req);
    const c = container();
    const { link } = await c.requestSignInLink.execute({ email: String(email ?? "") });
    const devLink = c.mailerIsConsole && process.env.NODE_ENV !== "production" ? link : undefined;
    return NextResponse.json({ sent: true, devLink });
  });
