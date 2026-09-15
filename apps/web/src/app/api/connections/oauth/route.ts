import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, requireUserId, setPendingSignIn } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";

/**
 * Starts connecting an account by signing in at the provider. Answers the
 * address to send the browser to; what the way back needs stays in a sealed,
 * HttpOnly cookie scoped to the callback.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { connector, values, returnTo } = await readJson<{ connector?: string; values?: Record<string, unknown>; returnTo?: string }>(req);
    const { url, pending } = await container().startConnectionSignIn.execute({ userId, connector: String(connector ?? ""), values: values ?? {}, returnTo, fallbackReturn: ROUTES.settings });
    const response = NextResponse.json({ url });
    setPendingSignIn(response, pending);
    return response;
  });
