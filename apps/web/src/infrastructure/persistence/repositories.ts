import { createHash } from "node:crypto";
import type { SeriesPoint } from "@flexwall/sdk";
import type {
  CachedValues,
  ConnectionRepository,
  EventLog,
  HandleRegistry,
  ReferralRepository,
  SnapshotStore,
  UserRepository,
  ValueCache,
  WallRepository,
} from "@/application/ports";
import type { Connection } from "@/domain/connection";
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

export class DbEventLog implements EventLog {
  constructor(private readonly db: Db) {}
  firstTime = (id: string) => this.db.create("events", docId(id), { id, at: Date.now() });
}
