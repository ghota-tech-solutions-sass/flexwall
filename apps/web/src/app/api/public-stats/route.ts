import { NextResponse } from "next/server";
import { db } from "@/infrastructure/persistence/db";
import { container } from "@/composition";
import { handle } from "@/presentation/http";

let cached: { until: number; value: Record<string, number | string> } | undefined;
let pending: Promise<Record<string, number | string>> | undefined;
async function read() {
  const store = db();
  const c = container();
  const [accounts, walls, published, connectors] = await Promise.all([
    store.count("users"), store.count("walls"), store.count("walls", [["published", true]]), c.publicConnectors.execute(),
  ]);
  return { accounts, walls, published, connectors: connectors.length, widgets: c.catalog.widgets().length, updatedAt: new Date().toISOString() };
}
/** Only aggregate totals. No identities, wall contents, credentials or revenue. */
export const GET = () => handle(async () => {
  if (!cached || cached.until <= Date.now()) {
    pending ??= read().finally(() => { pending = undefined; });
    cached = { value: await pending, until: Date.now() + 300_000 };
  }
  return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
});
