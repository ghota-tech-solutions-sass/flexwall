import { DomainError, notFound } from "@/domain/errors";
import { Handle } from "@/domain/handle";
import { todayIn } from "@/domain/time";
import { newWall, type Wall } from "@/domain/wall";
import type { Clock, HandleRegistry, IdGenerator, UserRepository, WallRepository } from "../ports";

/** Gives a signed-in user their @handle and the wall that lives there. Once. */
export class ClaimHandle {
  constructor(
    private readonly deps: { users: UserRepository; handles: HandleRegistry; walls: WallRepository; ids: IdGenerator; clock: Clock }
  ) {}

  async execute(input: { userId: string; handle: string }): Promise<Wall> {
    const handle = Handle.parse(input.handle);
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw notFound("This account");
    if (user.handle) throw new DomainError("handle_already_set", `You're already @${user.handle}.`);

    const claimed = await this.deps.handles.claim(handle, user.id);
    if (!claimed) throw new DomainError("handle_taken", `@${handle} is taken.`);

    const now = this.deps.clock.now();
    await this.deps.users.save({ ...user, handle });
    const wall = newWall({
      id: this.deps.ids.next(),
      owner: { id: user.id, handle },
      lockNonce: this.deps.ids.next(),
      now,
      today: todayIn(user.timeZone, now),
    });
    await this.deps.walls.save(wall);
    return wall;
  }
}
