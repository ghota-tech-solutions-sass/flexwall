import { NextResponse } from "next/server";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";
import { HTTP_STATUS } from "@/presentation/json";

export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { connector, values } = await readJson<{ connector?: string; values?: Record<string, unknown> }>(req);
    const connection = await container().connectAccount.execute({ userId, connector: String(connector ?? ""), values: values ?? {} });
    return NextResponse.json({ connection }, { status: HTTP_STATUS.created });
  });
