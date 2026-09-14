import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson } from "@/presentation/http";

export const POST = (req: Request) =>
  handle(async () => {
    const { handle: wall, reason, contact } = await readJson<{ handle?: string; reason?: string; contact?: string }>(req);
    await container().reportWall.execute({ handle: String(wall ?? ""), reason: String(reason ?? ""), contact: contact ? String(contact) : undefined });
    return NextResponse.json({ received: true });
  });
