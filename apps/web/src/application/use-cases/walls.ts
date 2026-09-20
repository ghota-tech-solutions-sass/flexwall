import type { Catalog } from "@/domain/catalog";
import { viewOf, type ConnectionView } from "@/domain/connection";
import { DomainError, notFound } from "@/domain/errors";
import { Handle } from "@/domain/handle";
import { entitlementsOf, paidPlanOf, type Entitlements, type Plan, type User } from "@/domain/user";
import { applyDraft, publicTiles, type Wall, type WallDraft } from "@/domain/wall";
import type { AppLinks, Clock, ConnectionRepository, ConnectorAvailability, IdGenerator, TokenService, UserRepository, WallRepository } from "../ports";
import { administrates } from "./connector-policy";

export interface OwnerWall {
  /** The plan paid for, ignoring referral rewards: whether upgrading still makes sense. */
  paidPlan: Plan;
  user: User;
  wall: Wall;
  entitlements: Entitlements;
  connections: ConnectionView[];
  /** Ids of the connectors this owner may connect: the rest are paused or kept to administrators. */
  allowedConnectors: string[];
  lockscreenPath: string;
}

async function ownerContext(
  deps: { users: UserRepository; walls: WallRepository; connections: ConnectionRepository },
  userId: string
) {
  const user = await deps.users.byId(userId);
  if (!user) throw new DomainError("unauthenticated", "Sign in again.");
  const wall = await deps.walls.byOwner(user.id);
  if (!wall) throw notFound("Your wall");
  const connections = await deps.connections.byOwner(user.id);
  return { user, wall, connections };
}

/** Everything the editor loads. */
export class GetOwnerWall {
  constructor(
    private readonly deps: {
      users: UserRepository;
      walls: WallRepository;
      connections: ConnectionRepository;
      tokens: TokenService;
      links: AppLinks;
      clock: Clock;
      access: ConnectorAvailability;
      administrators: readonly string[];
    }
  ) {}

  async execute(input: { userId: string }): Promise<OwnerWall> {
    const { user, wall, connections } = await ownerContext(this.deps, input.userId);
    return {
      user,
      wall,
      entitlements: entitlementsOf(user, this.deps.clock.now()),
      // What this owner may connect: the editor and settings only show these.
      allowedConnectors: await this.deps.access.allowedFor({ administrator: administrates(user, this.deps.administrators) }),
      paidPlan: paidPlanOf(user, this.deps.clock.now()),
      connections: connections.map(viewOf),
      lockscreenPath: this.deps.links.lockscreen(wall.id, this.deps.tokens.lockKey(wall.id, wall.lockNonce)),
    };
  }
}

export class SaveWall {
  constructor(
    private readonly deps: { users: UserRepository; walls: WallRepository; connections: ConnectionRepository; catalog: Catalog; clock: Clock }
  ) {}

  async execute(input: { userId: string; draft: WallDraft }): Promise<Wall> {
    const { user, wall, connections } = await ownerContext(this.deps, input.userId);
    const now = this.deps.clock.now();
    const next = applyDraft(wall, input.draft, { catalog: this.deps.catalog, entitlements: entitlementsOf(user, now), connections }, now);
    await this.deps.walls.save(next);
    return next;
  }
}

/** Kills the current lock screen link and returns the new one. */
export class RotateLockscreenLink {
  constructor(
    private readonly deps: { walls: WallRepository; ids: IdGenerator; tokens: TokenService; links: AppLinks; clock: Clock }
  ) {}

  async execute(input: { userId: string }): Promise<{ lockscreenPath: string }> {
    const wall = await this.deps.walls.byOwner(input.userId);
    if (!wall) throw notFound("Your wall");
    const next = { ...wall, lockNonce: this.deps.ids.next(), updatedAt: this.deps.clock.now() };
    await this.deps.walls.save(next);
    return { lockscreenPath: this.deps.links.lockscreen(next.id, this.deps.tokens.lockKey(next.id, next.lockNonce)) };
  }
}

export interface PublicWall {
  wall: Wall;
  owner: User;
  entitlements: Entitlements;
  /** The owner is looking at their own unpublished wall. */
  preview: boolean;
}

/** A wall as strangers see it: published, public tiles only. Owners may preview theirs unpublished. */
export class GetPublicWall {
  constructor(
    private readonly deps: { walls: WallRepository; users: UserRepository; clock: Clock }
  ) {}

  async execute(input: { handle: string; viewerId?: string | null }): Promise<PublicWall> {
    const handle = Handle.lookup(input.handle);
    if (!handle) throw notFound("This wall");
    const wall = await this.deps.walls.byHandle(handle);
    if (!wall) throw notFound("This wall");
    const preview = !wall.published && input.viewerId === wall.ownerId;
    if (!wall.published && !preview) throw notFound("This wall");
    const owner = await this.deps.users.byId(wall.ownerId);
    if (!owner) throw notFound("This wall");
    return { wall: { ...wall, tiles: publicTiles(wall) }, owner, entitlements: entitlementsOf(owner, this.deps.clock.now()), preview };
  }
}
