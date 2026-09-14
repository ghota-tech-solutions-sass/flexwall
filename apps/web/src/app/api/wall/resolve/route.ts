import { NextResponse } from "next/server";
import type { Tile } from "@/domain/wall";
import { container } from "@/composition";
import { handle, readJson, requireUserId } from "@/presentation/http";

/** Tiles a draft may hold beyond the plan while the owner edits: save refuses the excess, previews don't need to. */
const RESOLVE_TILE_SLACK = 20;

/**
 * Live values for the editor. Takes unsaved tiles, but the resolver only ever
 * opens the owner's own connections, so a draft can't read anyone else's account.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const userId = await requireUserId();
    const { tiles } = await readJson<{ tiles?: Tile[] }>(req);
    const c = container();
    const owner = await c.getOwnerWall.execute({ userId });
    const drafts = (Array.isArray(tiles) ? tiles : []).slice(0, owner.entitlements.maxTiles + RESOLVE_TILE_SLACK);
    const { states, today } = await c.resolveWall.execute({ tiles: drafts, owner: owner.user, surface: "editor" });
    return NextResponse.json({ states, today });
  });
