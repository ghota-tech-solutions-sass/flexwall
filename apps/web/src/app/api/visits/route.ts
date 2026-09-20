import { NextResponse } from "next/server";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { db } from "@/infrastructure/persistence/db";
import { recordVisit } from "@/infrastructure/analytics/visits";
import { handle, readJson } from "@/presentation/http";
import { visitTarget } from "@/presentation/visit-paths";

export const POST = (req: Request) => handle(async () => {
  if (!req.headers.get("origin") || req.headers.get("sec-fetch-site") === "cross-site") throw new DomainError("forbidden", "Same-origin requests only.");
  const input = await readJson<unknown>(req);
  if (!input || typeof input !== "object" || !("id" in input) || !("path" in input) || typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) || typeof input.path !== "string" || input.path.length > 120) throw new DomainError("invalid_input", "Invalid page view.");
  const target = visitTarget(input.path);
  const result = (counted: boolean) => NextResponse.json({ counted }, { headers: { "Cache-Control": "no-store" } });
  if (!target || req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1" || /bot|crawler|spider|headless|preview|lighthouse/i.test(req.headers.get("user-agent") ?? "")) return result(false);
  const c = container();
  if (target.kind === "wall") {
    try { await c.getPublicWall.execute({ handle: target.id }); }
    catch (error) { if (error instanceof DomainError && error.code === "not_found") return result(false); throw error; }
  }
  if (target.kind === "integration" && !(await c.publicConnectors.execute()).includes(target.id)) return result(false);
  return result(await recordVisit(db(), input.id.toLowerCase(), target.kind === "wall" && target.id === "flexwall"));
});
