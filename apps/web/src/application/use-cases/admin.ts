import { isAdministrator, offerPro, withdrawPro, type ComplimentaryTerm } from "@/domain/admin";
import { MAX_PAID_ACCOUNTS } from "@/domain/pricing";
import { DomainError, notFound } from "@/domain/errors";
import { entitlementsOf, planSourceOf, type Complimentary, type Plan, type PlanSource, type Subscription, type User } from "@/domain/user";
import type { Clock, ConnectionRepository, UserRepository, WallRepository } from "../ports";

/** Accounts the administration reads at most: enough for Flexwall's size, and a bound on a slow page. */
export const ADMIN_LIST_LIMIT = 2000;

export interface AccountRow {
  id: string;
  email: string;
  handle: string | null;
  createdAt: number;
  plan: Plan;
  source: PlanSource;
  complimentaryUntil: number | null;
}

export interface AccountDetail extends AccountRow {
  timeZone: string;
  stripeCustomerId: string | null;
  subscription: Subscription | null;
  lifetime: boolean;
  bonusProUntil: number | null;
  complimentary: Complimentary | null;
  referredBy: string | null;
  wall: { id: string; handle: string; title: string; published: boolean; listed: boolean; tiles: number; updatedAt: number } | null;
  connections: { id: string; connector: string; label: string; createdAt: number; expiresAt: number | null }[];
}

interface AdminDeps {
  users: UserRepository;
  walls: WallRepository;
  connections: ConnectionRepository;
  clock: Clock;
  administrators: readonly string[];
}

/** The administrator behind a request, or a not-found: the back office doesn't admit it exists to anyone else. */
async function administrator(deps: Pick<AdminDeps, "users" | "administrators">, userId: string | null): Promise<User> {
  const user = userId ? await deps.users.byId(userId) : null;
  if (!user || !isAdministrator(user, deps.administrators)) throw notFound("This page");
  return user;
}

function rowOf(user: User, now: number): AccountRow {
  const plan = entitlementsOf(user, now).plan;
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    createdAt: user.createdAt,
    plan,
    source: planSourceOf(user, now),
    complimentaryUntil: user.complimentary?.until ?? null,
  };
}

/** Whether the signed-in user may see the back office. For links, not for guarding it. */
export class IsAdministrator {
  constructor(private readonly deps: Pick<AdminDeps, "users" | "administrators">) {}

  async execute(input: { userId: string | null }): Promise<boolean> {
    return administrator(this.deps, input.userId).then(
      () => true,
      () => false
    );
  }
}

/** Every account, newest first, narrowed by a search on email or handle. */
export class ListAccounts {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; query?: string; source?: PlanSource | "all" }): Promise<{ accounts: AccountRow[]; total: number; truncated: boolean }> {
    await administrator(this.deps, input.userId);
    const now = this.deps.clock.now();
    const users = await this.deps.users.list(ADMIN_LIST_LIMIT);
    const q = (input.query ?? "").trim().toLowerCase().replace(/^@/, "");
    const rows = users
      .map((u) => rowOf(u, now))
      .filter((r) => !q || r.email.includes(q) || (r.handle ?? "").includes(q) || r.id === q)
      .filter((r) => !input.source || input.source === "all" || r.source === input.source)
      .sort((a, b) => b.createdAt - a.createdAt);
    return { accounts: rows, total: users.length, truncated: users.length >= ADMIN_LIST_LIMIT };
  }
}

export class GetAccount {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; accountId: string }): Promise<AccountDetail> {
    await administrator(this.deps, input.userId);
    const user = await this.deps.users.byId(input.accountId);
    if (!user) throw notFound("This account");
    const [wall, connections] = await Promise.all([this.deps.walls.byOwner(user.id), this.deps.connections.byOwner(user.id)]);
    return {
      ...rowOf(user, this.deps.clock.now()),
      timeZone: user.timeZone,
      stripeCustomerId: user.stripeCustomerId,
      subscription: user.subscription,
      lifetime: user.lifetime,
      bonusProUntil: user.bonusProUntil ?? null,
      complimentary: user.complimentary ?? null,
      referredBy: user.referredBy ?? null,
      wall: wall
        ? { id: wall.id, handle: wall.handle, title: wall.title, published: wall.published, listed: wall.listed, tiles: wall.tiles.length, updatedAt: wall.updatedAt }
        : null,
      connections: connections
        .map((c) => ({ id: c.id, connector: c.connector, label: c.label, createdAt: c.createdAt, expiresAt: c.expiresAt ?? null }))
        .sort((a, b) => b.createdAt - a.createdAt),
    };
  }
}

/** Gives an account Pro without payment, or extends what it was given. */
export class OfferPro {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; accountId: string; term: ComplimentaryTerm; note: string }): Promise<AccountRow> {
    const admin = await administrator(this.deps, input.userId);
    const user = await this.deps.users.byId(input.accountId);
    if (!user) throw notFound("This account");
    const now = this.deps.clock.now();
    const next = offerPro(user, { term: input.term, note: input.note, by: admin.email, now });
    await this.deps.users.save(next);
    return rowOf(next, now);
  }
}

/** Takes offered Pro back. What the account pays for, or earned by referrals, stays. */
export class WithdrawPro {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; accountId: string }): Promise<AccountRow> {
    await administrator(this.deps, input.userId);
    const user = await this.deps.users.byId(input.accountId);
    if (!user) throw notFound("This account");
    if (!user.complimentary) throw new DomainError("invalid_input", "This account has no offered Pro to take back.");
    const next = withdrawPro(user);
    await this.deps.users.save(next);
    return rowOf(next, this.deps.clock.now());
  }
}

/**
 * Gives an account connected bank or brokerage accounts for nothing, or takes
 * some back. Nothing goes through Stripe: what an owner pays for is their
 * subscription, and this sits beside it.
 */
export class GrantPaidAccounts {
  constructor(private readonly deps: Pick<AdminDeps, "users" | "administrators" | "clock">) {}

  async execute(input: { userId: string | null; accountId: string; accounts: number }): Promise<{ granted: number }> {
    await administrator(this.deps, input.userId);
    const user = await this.deps.users.byId(input.accountId);
    if (!user) throw notFound("This account");
    const granted = Number(input.accounts);
    if (!Number.isInteger(granted) || granted < 0 || granted > MAX_PAID_ACCOUNTS) {
      throw new DomainError("invalid_input", `Give a whole number of accounts between 0 and ${MAX_PAID_ACCOUNTS}.`);
    }
    await this.deps.users.save({ ...user, paidAccountsGranted: granted });
    return { granted };
  }
}

/** Takes a wall off The Wall or offline, after a report. The owner can publish it again from the editor. */
export class ModerateWall {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; accountId: string; published?: boolean; listed?: boolean }): Promise<{ published: boolean; listed: boolean }> {
    await administrator(this.deps, input.userId);
    const wall = await this.deps.walls.byOwner(input.accountId);
    if (!wall) throw notFound("This account's wall");
    const published = typeof input.published === "boolean" ? input.published : wall.published;
    // A listing needs a public page, as in the editor.
    const listed = published && (typeof input.listed === "boolean" ? input.listed : wall.listed);
    await this.deps.walls.save({ ...wall, published, listed, updatedAt: this.deps.clock.now() });
    return { published, listed };
  }
}
