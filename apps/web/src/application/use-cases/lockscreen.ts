import { notFound } from "@/domain/errors";
import type { User } from "@/domain/user";
import type { Tile, Wall } from "@/domain/wall";
import type { Box } from "@/domain/layout";
import type { TokenService, UserRepository, WallRepository } from "../ports";

export interface Lockscreen {
  wall: Wall;
  owner: User;
  /** Tiles placed on the lock screen, with their lock screen boxes. Private tiles included: it's the owner's phone. */
  placed: { tile: Tile; box: Box }[];
}

/** What the Shortcut's image link draws. The key in the link is the only credential. */
export class GetLockscreen {
  constructor(private readonly deps: { walls: WallRepository; users: UserRepository; tokens: TokenService }) {}

  async execute(input: { wallId: string; key: string }): Promise<Lockscreen> {
    const wall = await this.deps.walls.byId(input.wallId);
    // A wrong key looks exactly like a missing wall.
    if (!wall || !this.deps.tokens.verifyLockKey(wall.id, wall.lockNonce, input.key)) throw notFound("This lock screen");
    const owner = await this.deps.users.byId(wall.ownerId);
    if (!owner) throw notFound("This lock screen");
    const placed = wall.lockscreen.placements.flatMap((p) => {
      const tile = wall.tiles.find((t) => t.id === p.tileId);
      return tile ? [{ tile, box: p.box }] : [];
    });
    return { wall, owner, placed };
  }
}
