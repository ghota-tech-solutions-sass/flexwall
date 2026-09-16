import type { ConnectorContext, FieldValues, SeriesPoint, Value } from "@flexwall/sdk";
import type { Connection } from "@/domain/connection";
import type { Availability, ConnectorPolicy } from "@/domain/connector-policy";
import type { Handle } from "@/domain/handle";
import type { Referral } from "@/domain/referral";
import type { Subscription, User } from "@/domain/user";
import type { BillingPlan } from "@/domain/pricing";
import type { Wall } from "@/domain/wall";

/**
 * Everything a use case needs from the outside world. Infrastructure
 * implements these; tests use the in-memory versions in tests/fakes.
 */

export interface UserRepository {
  byId(id: string): Promise<User | null>;
  byEmail(email: string): Promise<User | null>;
  byStripeCustomer(customerId: string): Promise<User | null>;
  /** Accounts for the administration, at most `limit`, in no particular order. */
  list(limit: number): Promise<User[]>;
  save(user: User): Promise<void>;
}

export interface HandleRegistry {
  /** Atomic: true if the handle was free and is now the user's. */
  claim(handle: Handle, userId: string): Promise<boolean>;
  ownerOf(handle: Handle): Promise<string | null>;
}

export interface ReferralRepository {
  /** The referral that brought this invitee, if any. */
  byReferee(refereeId: string): Promise<Referral | null>;
  byReferrer(referrerId: string): Promise<Referral[]>;
  save(referral: Referral): Promise<void>;
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
  /** Every connection, at most `limit`, for the administration's counts. */
  list(limit: number): Promise<Connection[]>;
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

/** Who may use each connector right now, by connector id. The application decides it; use cases only read it. */
export interface ConnectorAvailability {
  all(): Promise<Record<string, Availability>>;
  /** The connector ids this viewer may see and connect. */
  allowedFor(viewer: { administrator: boolean }): Promise<string[]>;
}

/**
 * What administrators decided about each connector, by connector id. One
 * document for all of them: a wall render needs the lot or none.
 */
export interface ConnectorPolicies {
  all(): Promise<Record<string, ConnectorPolicy>>;
  save(connectorId: string, policy: ConnectorPolicy): Promise<void>;
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

export type { BillingPlan } from "@/domain/pricing";

/**
 * Addresses a use case hands out: in emails, to the payment provider, in
 * answers to the editor. The host builds them from its routes, so the
 * application never spells a path.
 */
export interface AppLinks {
  /** Absolute: opened from an email. */
  signIn(token: string): string;
  /** Relative to the app: the lock screen image of a wall, keyed so it can be revoked. */
  lockscreen(wallId: string, key: string): string;
  /** Absolute: where the payment provider sends a buyer after paying. */
  checkoutSucceeded(): string;
  /** Absolute: where the payment provider sends a buyer who gave up. */
  checkoutCancelled(): string;
  /** Absolute: where the payment provider sends an owner after paying for a connected account. */
  paidAccountAdded(): string;
  /** Absolute: where the billing portal returns to. */
  billingReturn(): string;
  /** Absolute and shareable: an invite from `handle`. */
  referral(handle: string): string;
  /** Absolute: where a provider sends the owner back after signing in. Registered with each provider. */
  oauthCallback(): string;
}

/** What a buyer agreed to before paying: the terms in force, and to start right away despite the withdrawal period. */
export interface CheckoutConsent {
  termsVersion: string;
  acceptedAt: number;
}

/** A payment provider event, already verified and translated. */
/** Which subscription an event is about: the plan, or the connected accounts paid for monthly. */
export type SubscriptionRole = "pro" | "paid_accounts";

export type BillingEvent =
  | { id: string; type: "subscription"; role: SubscriptionRole; customerId: string; userId: string | null; subscription: Subscription }
  | { id: string; type: "lifetime"; customerId: string; userId: string }
  /** A charge refunded in full. `role` says what it paid for; "unknown" is treated as a plan, as before. */
  | { id: string; type: "refund"; role: SubscriptionRole | "unknown"; customerId: string };

export interface PaymentGateway {
  enabled(): boolean;
  checkoutUrl(input: {
    user: User;
    plan: BillingPlan;
    consent: CheckoutConsent;
    /** The invitee discount applies to this payment. */
    referralDiscount: boolean;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customerId: string }>;
  /** Opens the monthly subscription that pays for connected accounts, at `quantity` of them. */
  paidAccountsCheckoutUrl(input: {
    user: User;
    quantity: number;
    consent: CheckoutConsent;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customerId: string }>;
  /** Sets how many accounts are paid for. Raising invoices the rest of the month now; lowering leaves a credit. */
  setPaidAccountsQuantity(input: { subscription: Subscription; quantity: number; direction: "up" | "down" }): Promise<Subscription>;
  /** The accounts subscriptions this customer has, to keep exactly one. */
  paidAccountsSubscriptions(customerId: string): Promise<Subscription[]>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  portalUrl(input: { customerId: string; returnUrl: string }): Promise<string>;
  /** Null for events that don't change entitlements. Throws on a bad signature. */
  parseEvent(rawBody: string, signature: string): Promise<BillingEvent | null>;
}

/** Builds the context plugins run in: the guarded network, env allowlist, logging. */
export interface ConnectorRuntime {
  context(today: string): ConnectorContext;
}

export type { FieldValues };
