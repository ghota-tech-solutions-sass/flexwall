import type { ConnectorContext, FieldValues, SeriesPoint, Value } from "@flexwall/sdk";
import type { Connection } from "@/domain/connection";
import type { Handle } from "@/domain/handle";
import type { Subscription, User } from "@/domain/user";
import type { Wall } from "@/domain/wall";

/**
 * Everything a use case needs from the outside world. Infrastructure
 * implements these; tests use the in-memory versions in tests/fakes.
 */

export interface UserRepository {
  byId(id: string): Promise<User | null>;
  byEmail(email: string): Promise<User | null>;
  byStripeCustomer(customerId: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface HandleRegistry {
  /** Atomic: true if the handle was free and is now the user's. */
  claim(handle: Handle, userId: string): Promise<boolean>;
  ownerOf(handle: Handle): Promise<string | null>;
}

export interface WallRepository {
  byId(id: string): Promise<Wall | null>;
  byOwner(ownerId: string): Promise<Wall | null>;
  byHandle(handle: Handle): Promise<Wall | null>;
  listed(limit: number): Promise<Wall[]>;
  save(wall: Wall): Promise<void>;
}

export interface ConnectionRepository {
  byId(id: string): Promise<Connection | null>;
  byOwner(ownerId: string): Promise<Connection[]>;
  save(connection: Connection): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface CachedValues {
  /** Epoch ms of the fetch. */
  at: number;
  values: Record<string, Value | null>;
}

export interface ValueCache {
  get(key: string): Promise<CachedValues | null>;
  set(key: string, entry: CachedValues): Promise<void>;
}

export interface SnapshotStore {
  /** One point per series per day; a later call the same day replaces it. */
  record(series: string, day: string, value: number): Promise<void>;
  range(series: string, fromDay: string, toDay: string): Promise<SeriesPoint[]>;
}

/** Remembers processed webhook events. */
export interface EventLog {
  /** True the first time an id is seen. */
  firstTime(id: string): Promise<boolean>;
}

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}

export interface SecretBox {
  seal(value: Record<string, string>): string;
  open(sealed: string): Record<string, string>;
}

export interface TokenService {
  session(userId: string): string;
  verifySession(token: string | undefined): string | null;
  magic(email: string): string;
  verifyMagic(token: string | undefined): string | null;
  lockKey(wallId: string, nonce: string): string;
  verifyLockKey(wallId: string, nonce: string, key: string): boolean;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export type BillingPlan = "monthly" | "yearly" | "lifetime";

/** A payment provider event, already verified and translated. */
export type BillingEvent =
  | { id: string; type: "subscription"; customerId: string; userId: string | null; subscription: Subscription }
  | { id: string; type: "lifetime"; customerId: string; userId: string };

export interface PaymentGateway {
  enabled(): boolean;
  checkoutUrl(input: { user: User; plan: BillingPlan; successUrl: string; cancelUrl: string }): Promise<{ url: string; customerId: string }>;
  portalUrl(input: { customerId: string; returnUrl: string }): Promise<string>;
  /** Null for events that don't change entitlements. Throws on a bad signature. */
  parseEvent(rawBody: string, signature: string): Promise<BillingEvent | null>;
}

/** Builds the context plugins run in: the guarded network, env allowlist, logging. */
export interface ConnectorRuntime {
  context(today: string): ConnectorContext;
}

export type { FieldValues };
