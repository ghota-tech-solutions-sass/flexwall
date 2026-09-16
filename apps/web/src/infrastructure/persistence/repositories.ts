import { createHash } from "node:crypto";
import type { SeriesPoint } from "@flexwall/sdk";
import type {
  CachedValues,
  ConnectionRepository,
  ConnectorPolicies,
  CreditAccounts,
  EventLog,
  HandleRegistry,
  ReferralRepository,
  SnapshotStore,
  UserRepository,
  ValueCache,
  WallRepository,
} from "@/application/ports";
import type { Connection } from "@/domain/connection";
import type { ConnectorPolicy } from "@/domain/connector-policy";
import type { CreditEntry, SpendOutcome } from "@/domain/credits";
import type { Handle } from "@/domain/handle";
import type { Referral } from "@/domain/referral";
import type { User } from "@/domain/user";
import type { Wall } from "@/domain/wall";
import type { Db, Doc } from "./db";

/** Firestore document ids can't contain "/", and cache keys do. */
const docId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 40);
const asDoc = (v: object) => v as unknown as Doc;

export class DbUsers implements UserRepository {
  constructor(private readonly db: Db) {}
  byId = (id: string) => this.db.get<Doc>("users", id) as Promise<User | null>;
  async byEmail(email: string) {
    return ((await this.db.where("users", [["email", email.toLowerCase()]], 1))[0] as unknown as User) ?? null;
  }
  async byStripeCustomer(customerId: string) {
    return ((await this.db.where("users", [["stripeCustomerId", customerId]], 1))[0] as unknown as User) ?? null;
  }
  list = (limit: number) => this.db.where("users", [], limit) as unknown as Promise<User[]>;
  save = (user: User) => this.db.set("users", user.id, asDoc(user));
}

export class DbHandles implements HandleRegistry {
  constructor(private readonly db: Db) {}
  claim = (handle: Handle, userId: string) => this.db.create("handles", handle, { handle, userId });
  async ownerOf(handle: Handle) {
    return ((await this.db.get<{ userId: string }>("handles", handle))?.userId as string) ?? null;
  }
}

/** One document per invitee, keyed by their user id. */
export class DbReferrals implements ReferralRepository {
  constructor(private readonly db: Db) {}
  byReferee = (refereeId: string) => this.db.get<Doc>("referrals", refereeId) as Promise<Referral | null>;
  byReferrer = (referrerId: string) => this.db.where("referrals", [["referrerId", referrerId]]) as unknown as Promise<Referral[]>;
  save = (referral: Referral) => this.db.set("referrals", referral.id, asDoc(referral));
}

export class DbWalls implements WallRepository {
  constructor(private readonly db: Db) {}
  byId = (id: string) => this.db.get<Doc>("walls", id) as Promise<Wall | null>;
  async byOwner(ownerId: string) {
    return ((await this.db.where("walls", [["ownerId", ownerId]], 1))[0] as unknown as Wall) ?? null;
  }
  async byHandle(handle: Handle) {
    return ((await this.db.where("walls", [["handle", handle]], 1))[0] as unknown as Wall) ?? null;
  }
  listed = (limit: number) => this.db.where("walls", [["listed", true]], limit) as unknown as Promise<Wall[]>;
  save = (wall: Wall) => this.db.set("walls", wall.id, asDoc(wall));
}

export class DbConnections implements ConnectionRepository {
  constructor(private readonly db: Db) {}
  byId = (id: string) => this.db.get<Doc>("connections", id) as Promise<Connection | null>;
  byOwner = (ownerId: string) => this.db.where("connections", [["ownerId", ownerId]]) as unknown as Promise<Connection[]>;
  list = (limit: number) => this.db.where("connections", [], limit) as unknown as Promise<Connection[]>;
  save = (c: Connection) => this.db.set("connections", c.id, asDoc(c));
  delete = (id: string) => this.db.delete("connections", id);
}

export class DbValueCache implements ValueCache {
  constructor(private readonly db: Db) {}
  async get(key: string) {
    const doc = await this.db.get<{ key: string; entry: CachedValues }>("values", docId(key));
    return doc && doc.key === key ? doc.entry : null;
  }
  set = (key: string, entry: CachedValues) => this.db.set("values", docId(key), { key, entry: asDoc(entry) });
}

/** One document per series, days as a map, trimmed to the last 400 days. */
export class DbSnapshots implements SnapshotStore {
  private static readonly KEEP_DAYS = 400;
  constructor(private readonly db: Db) {}

  record(series: string, day: string, value: number) {
    const id = docId(series);
    return this.db.transaction(async (tx) => {
      const doc = await tx.get<{ series: string; days: Record<string, number> }>("snapshots", id);
      const days = { ...(doc?.days ?? {}), [day]: value };
      const kept = Object.keys(days).sort().slice(-DbSnapshots.KEEP_DAYS);
      tx.set("snapshots", id, { series, days: Object.fromEntries(kept.map((d) => [d, days[d]])) });
    });
  }

  async range(series: string, fromDay: string, toDay: string): Promise<SeriesPoint[]> {
    const doc = await this.db.get<{ series: string; days: Record<string, number> }>("snapshots", docId(series));
    if (!doc || doc.series !== series) return [];
    return Object.entries(doc.days)
      .filter(([t]) => t >= fromDay && t <= toDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, v]) => ({ t, v }));
  }
}

/**
 * A balance document per user, apart from the user document so saving a user
 * can never overwrite a balance, and one document per entry. Each change reads
 * and writes both in one transaction.
 */
export class DbCredits implements CreditAccounts {
  /** Entries read to show the latest ones: the store can't sort, so it reads a bounded batch. */
  private static readonly HISTORY_SCAN = 500;
  constructor(private readonly db: Db) {}

  private static spendId = (userId: string, key: string, day: string) => docId(`spend|${userId}|${key}|${day}`);

  async balance(userId: string) {
    return (await this.db.get<{ balance: number }>("credit_balances", userId))?.balance ?? 0;
  }

  spend(input: { userId: string; key: string; day: string; amount: number; detail: string }): Promise<SpendOutcome> {
    const id = DbCredits.spendId(input.userId, input.key, input.day);
    return this.db.transaction(async (tx) => {
      const [entry, account] = await Promise.all([tx.get("credit_entries", id), tx.get<{ balance: number }>("credit_balances", input.userId)]);
      if (entry) return "already_paid";
      const balance = account?.balance ?? 0;
      if (balance < input.amount) return "insufficient";
      const now = Date.now();
      tx.set("credit_balances", input.userId, { userId: input.userId, balance: balance - input.amount, updatedAt: now });
      tx.set("credit_entries", id, asDoc({ id, userId: input.userId, amount: -input.amount, reason: "spend", at: now, detail: input.detail } satisfies CreditEntry));
      return "charged";
    });
  }

  release(input: { userId: string; key: string; day: string }): Promise<void> {
    const id = DbCredits.spendId(input.userId, input.key, input.day);
    return this.db.transaction(async (tx) => {
      const [entry, account] = await Promise.all([tx.get<CreditEntry & Doc>("credit_entries", id), tx.get<{ balance: number }>("credit_balances", input.userId)]);
      if (!entry) return;
      tx.set("credit_balances", input.userId, { userId: input.userId, balance: (account?.balance ?? 0) - entry.amount, updatedAt: Date.now() });
      tx.delete("credit_entries", id);
    });
  }

  adjust(input: { userId: string; entryId: string; amount: number; reason: Exclude<CreditEntry["reason"], "spend">; detail: string }): Promise<boolean> {
    const id = docId(`${input.reason}|${input.entryId}`);
    return this.db.transaction(async (tx) => {
      const [entry, account] = await Promise.all([tx.get("credit_entries", id), tx.get<{ balance: number }>("credit_balances", input.userId)]);
      if (entry) return false;
      const balance = account?.balance ?? 0;
      // Taking credits back stops at zero: what was already spent stays spent.
      const amount = Math.max(input.amount, -balance);
      const now = Date.now();
      tx.set("credit_balances", input.userId, { userId: input.userId, balance: balance + amount, updatedAt: now });
      tx.set("credit_entries", id, asDoc({ id, userId: input.userId, amount, reason: input.reason, at: now, detail: input.detail } satisfies CreditEntry));
      return true;
    });
  }

  async history(userId: string, limit: number) {
    const entries = (await this.db.where("credit_entries", [["userId", userId]], DbCredits.HISTORY_SCAN)) as unknown as CreditEntry[];
    return entries.sort((a, b) => b.at - a.at).slice(0, limit);
  }
}

/**
 * One document holds every connector's availability: a wall render reads it
 * once, and the cache in front of it (composition) keeps that to one store read
 * a minute per instance.
 */
export class DbConnectorPolicies implements ConnectorPolicies {
  private static readonly DOC = "connectors";
  constructor(private readonly db: Db) {}

  async all() {
    return ((await this.db.get<Doc>("settings", DbConnectorPolicies.DOC)) ?? {}) as Record<string, ConnectorPolicy>;
  }

  save(connectorId: string, policy: ConnectorPolicy) {
    return this.db.transaction(async (tx) => {
      const current = (await tx.get<Doc>("settings", DbConnectorPolicies.DOC)) ?? {};
      tx.set("settings", DbConnectorPolicies.DOC, { ...current, [connectorId]: asDoc(policy) });
    });
  }
}

export class DbEventLog implements EventLog {
  constructor(private readonly db: Db) {}
  firstTime = (id: string) => this.db.create("events", docId(id), { id, at: Date.now() });
}
