import { NextResponse } from "next/server";
import { z } from "zod";
import { valueCacheKey } from "@/lib/metrics";
import { getConnector } from "@/lib/connectors/registry";
import { ConnectorError } from "@/lib/connectors/types";
import { encryptJson } from "@/lib/crypto";
import { getWall, saveCachedValues, saveConnection } from "@/lib/store/walls";
import { newId } from "@/lib/tokens";
import { authorizeOwner, toView } from "@/lib/wall-server";

const MAX_CONNECTIONS = 6;

const BodySchema = z.object({
  source: z.string().max(32),
  input: z.record(z.string().max(64), z.string().max(4000)),
});

/**
 * Saves credentials for a connector after testing them. The connector's own
 * connect() decides what is secret; secrets are sealed here, before storage.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wall = await authorizeOwner(req, (await params).id);
  if (wall instanceof NextResponse) return wall;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const connector = getConnector(body.source);
  if (!connector?.connect) return NextResponse.json({ error: "unknown_connector" }, { status: 422 });
  if (Object.keys(wall.connections ?? {}).length >= MAX_CONNECTIONS) {
    return NextResponse.json({ error: "too_many_connections", message: `A wallpaper can hold ${MAX_CONNECTIONS} connections.` }, { status: 422 });
  }

  let result;
  try {
    result = await connector.connect(body.input);
  } catch (error) {
    if (error instanceof ConnectorError) return NextResponse.json({ error: "connect_failed", message: error.message }, { status: 422 });
    console.error(`connect ${body.source} failed:`, error);
    return NextResponse.json({ error: "connect_failed", message: `Couldn't reach ${connector.spec.label}. Try again in a moment.` }, { status: 502 });
  }

  const conn = {
    id: newId(8),
    source: body.source,
    label: result.label,
    public: result.public,
    sealed: encryptJson(result.secret),
    createdAt: Date.now(),
  };
  await saveConnection(wall.id, conn);
  if (result.values) {
    const key = valueCacheKey(body.source, conn.id, connector.cacheKey({ field: connector.spec.metrics[0].id, params: {} }));
    await saveCachedValues(wall.id, key, { at: Date.now(), values: result.values });
  }
  console.log(`wall ${wall.id} connected ${body.source} (${conn.id})`);
  return NextResponse.json({ connection: { id: conn.id, source: conn.source, label: conn.label, public: conn.public }, wall: toView((await getWall(wall.id))!) });
}
