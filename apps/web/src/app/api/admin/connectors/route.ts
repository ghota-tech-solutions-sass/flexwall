import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, sessionUserId } from "@/presentation/http";

/** Opens a connector to everyone, keeps it to administrators, or takes it off. Administrators only. */
export const POST = (req: Request) =>
  handle(async () => {
    const { connectorId, availability } = await readJson<{ connectorId?: string; availability?: unknown }>(req);
    const result = await container().setConnectorAvailability.execute({ userId: await sessionUserId(), connectorId: String(connectorId ?? ""), availability });
    return NextResponse.json(result);
  });
