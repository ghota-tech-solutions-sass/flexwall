import type { ConnectorContext, SeriesPoint } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import type { AppLinks, BillingEvent, BillingPlan, CachedValues, CheckoutConsent, Clock, ConnectionRepository, ConnectorAvailability, ConnectorPolicies, ConnectorRuntime, EventLog, HandleRegistry, IdGenerator, Mail, Mailer, PaymentGateway, ReferralRepository, SecretBox, SnapshotStore, TokenService, UserRepository, ValueCache, WallRepository } from "@/application/ports";
import type { Connection } from "@/domain/connection";
import { DEFAULT_AVAILABILITY, visibleTo, type Availability, type ConnectorPolicy } from "@/domain/connector-policy";
import type { BrowsableCatalog } from "@/domain/catalog";
import type { Handle } from "@/domain/handle";
import type { Referral } from "@/domain/referral";
import type { Subscription, User } from "@/domain/user";
import type { Wall } from "@/domain/wall";

/** In-memory stand-ins for every port. Each keeps what it was given, so tests can assert on it. */

export class FixedClock implements Clock {
  constructor(public time = Date.UTC(2026, 8, 14, 9, 0, 0)) {}
  now() {
    return this.time;
  }
  advance(ms: number) {
    this.time += ms;
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    return `id${++this.n}`;
  }
}

export class InMemoryUsers implements UserRepository {
  readonly items = new Map<string, User>();
  async byId(id: string) {
    return structuredClone(this.items.get(id) ?? null);
  }
  async byEmail(email: string) {
    return structuredClone([...this.items.values()].find((u) => u.email === email) ?? null);
  }
  async byStripeCustomer(customerId: string) {
    return structuredClone([...this.items.values()].find((u) => u.stripeCustomerId === customerId) ?? null);
  }
  async list(limit: number) {
    return structuredClone([...this.items.values()].slice(0, limit));
  }
  async save(user: User) {
    this.items.set(user.id, structuredClone(user));
  }
}

export class InMemoryHandles implements HandleRegistry {
  readonly items = new Map<string, string>();
  async claim(handle: Handle, userId: string) {
    if (this.items.has(handle)) return false;
    this.items.set(handle, userId);
    return true;
  }
  async ownerOf(handle: Handle) {
    return this.items.get(handle) ?? null;
  }
}

export class InMemoryReferrals implements ReferralRepository {
  readonly items = new Map<string, Referral>();
  async byReferee(refereeId: string) {
    return structuredClone(this.items.get(refereeId) ?? null);
  }
  async byReferrer(referrerId: string) {
    return structuredClone([...this.items.values()].filter((r) => r.referrerId === referrerId));
  }
  async save(referral: Referral) {
    this.items.set(referral.id, structuredClone(referral));
  }
}

export class InMemoryWalls implements WallRepository {
  readonly items = new Map<string, Wall>();
  async byId(id: string) {
    return structuredClone(this.items.get(id) ?? null);
  }
  async byOwner(ownerId: string) {
    return structuredClone([...this.items.values()].find((w) => w.ownerId === ownerId) ?? null);
  }
  async byHandle(handle: Handle) {
    return structuredClone([...this.items.values()].find((w) => w.handle === handle) ?? null);
  }
  async listed(limit: number) {
    return structuredClone([...this.items.values()].filter((w) => w.listed).slice(0, limit));
  }
  async save(wall: Wall) {
    this.items.set(wall.id, structuredClone(wall));
  }
}

export class InMemoryConnections implements ConnectionRepository {
  readonly items = new Map<string, Connection>();
  async byId(id: string) {
    return structuredClone(this.items.get(id) ?? null);
  }
  async byOwner(ownerId: string) {
    return structuredClone([...this.items.values()].filter((c) => c.ownerId === ownerId));
  }
  async list(limit: number) {
    return structuredClone([...this.items.values()].slice(0, limit));
  }
  async save(connection: Connection) {
    this.items.set(connection.id, structuredClone(connection));
  }
  async delete(id: string) {
    this.items.delete(id);
  }
}

export class InMemoryValueCache implements ValueCache {
  readonly items = new Map<string, CachedValues>();
  async get(key: string) {
    return structuredClone(this.items.get(key) ?? null);
  }
  async set(key: string, entry: CachedValues) {
    this.items.set(key, structuredClone(entry));
  }
}

export class InMemorySnapshots implements SnapshotStore {
  readonly items = new Map<string, Map<string, number>>();
  async record(series: string, day: string, value: number) {
    if (!this.items.has(series)) this.items.set(series, new Map());
    this.items.get(series)!.set(day, value);
  }
  async range(series: string, fromDay: string, toDay: string): Promise<SeriesPoint[]> {
    return [...(this.items.get(series) ?? new Map<string, number>()).entries()]
      .filter(([t]) => t >= fromDay && t <= toDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, v]) => ({ t, v }));
  }
}

/** Who may use which connector, without a store or a catalog scan. */
export class FakeAvailability implements ConnectorAvailability {
  constructor(
    private readonly value: Record<string, Availability> = {},
    private readonly catalog?: BrowsableCatalog
  ) {}
  /** Lets a test change its mind mid-render, the way an administrator would. */
  set(connectorId: string, availability: Availability) {
    this.value[connectorId] = availability;
  }
  async all() {
    return this.value;
  }
  async allowedFor(viewer: { administrator: boolean }) {
    return (this.catalog?.connectors() ?? []).filter((c) => visibleTo(this.value[c.id] ?? DEFAULT_AVAILABILITY, viewer)).map((c) => c.id);
  }
}

/** What administrators decided about connectors, kept in memory. */
export class InMemoryConnectorPolicies implements ConnectorPolicies {
  readonly items = new Map<string, ConnectorPolicy>();
  constructor(initial: Record<string, Availability> = {}, at = Date.UTC(2026, 8, 14, 9, 0, 0)) {
    for (const [id, availability] of Object.entries(initial)) this.items.set(id, { availability, by: "boss@flexwall.lol", at });
  }
  async all() {
    return Object.fromEntries(this.items);
  }
  async save(connectorId: string, policy: ConnectorPolicy) {
    this.items.set(connectorId, policy);
  }
}

export class InMemoryEventLog implements EventLog {
  readonly seen = new Set<string>();
  async firstTime(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }
}

/** Reversible and readable: tests can see what would have been encrypted. */
export class TransparentSecretBox implements SecretBox {
  seal(value: Record<string, string>) {
    return "sealed:" + JSON.stringify(value);
  }
  open(sealed: string) {
    if (!sealed.startsWith("sealed:")) throw new Error("not sealed by this box");
    return JSON.parse(sealed.slice("sealed:".length)) as Record<string, string>;
  }
}

export class FakeTokens implements TokenService {
  session = (userId: string) => `session:${userId}`;
  verifySession = (token: string | undefined) => (token?.startsWith("session:") ? token.slice(8) : null);
  magic = (email: string) => `magic:${email}`;
  verifyMagic = (token: string | undefined) => (token?.startsWith("magic:") ? token.slice(6) : null);
  lockKey = (wallId: string, nonce: string) => `lock:${wallId}:${nonce}`;
  verifyLockKey = (wallId: string, nonce: string, key: string) => key === `lock:${wallId}:${nonce}`;
}

/** Addresses on a test origin, shaped like the real ones but without depending on the app's routes. */
export class FakeLinks implements AppLinks {
  constructor(private readonly origin = "https://flexwall.test") {}
  signIn = (token: string) => `${this.origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  lockscreen = (wallId: string, key: string) => `/l/${wallId}/${key}`;
  checkoutSucceeded = () => `${this.origin}/settings?upgraded=1`;
  checkoutCancelled = () => `${this.origin}/pricing`;
  paidAccountAdded = () => `${this.origin}/settings?seats=1#accounts`;
  billingReturn = () => `${this.origin}/settings`;
  referral = (handle: string) => `${this.origin}/r/${handle}`;
  oauthCallback = () => `${this.origin}/api/connections/oauth/callback`;
}

export class RecordingMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
}

export class FakePayments implements PaymentGateway {
  readonly checkouts: { userId: string; plan: BillingPlan; consent: CheckoutConsent; referralDiscount: boolean }[] = [];
  readonly accountCheckouts: { userId: string; quantity: number; consent: CheckoutConsent }[] = [];
  readonly quantityChanges: { subscriptionId: string; quantity: number; direction: "up" | "down" }[] = [];
  readonly cancelled: string[] = [];
  /** Extra accounts subscriptions this customer turns out to have, for the duplicate cleanup. */
  extraSubscriptions: Subscription[] = [];
  constructor(
    private readonly on = true,
    private readonly events: Record<string, BillingEvent | null> = {},
    /** Makes the gateway fail the way Stripe would when it's down. */
    private readonly failOn: "none" | "quantity" | "checkout" = "none"
  ) {}
  enabled() {
    return this.on;
  }
  async checkoutUrl(input: { user: User; plan: BillingPlan; consent: CheckoutConsent; referralDiscount: boolean }) {
    this.checkouts.push({ userId: input.user.id, plan: input.plan, consent: input.consent, referralDiscount: input.referralDiscount });
    return { url: `https://pay.test/${input.plan}`, customerId: input.user.stripeCustomerId ?? `cus_${input.user.id}` };
  }
  async paidAccountsCheckoutUrl(input: { user: User; quantity: number; consent: CheckoutConsent }) {
    if (this.failOn === "checkout") throw new Error("payment provider unreachable");
    this.accountCheckouts.push({ userId: input.user.id, quantity: input.quantity, consent: input.consent });
    return { url: `https://pay.test/accounts/${input.quantity}`, customerId: input.user.stripeCustomerId ?? `cus_${input.user.id}` };
  }
  async setPaidAccountsQuantity(input: { subscription: Subscription; quantity: number; direction: "up" | "down" }) {
    if (this.failOn === "quantity") throw new Error("payment provider unreachable");
    this.quantityChanges.push({ subscriptionId: input.subscription.id, quantity: input.quantity, direction: input.direction });
    return { ...input.subscription, quantity: input.quantity, cancelAtPeriodEnd: input.quantity === 0 };
  }
  async paidAccountsSubscriptions() {
    return this.extraSubscriptions;
  }
  async cancelSubscription(subscriptionId: string) {
    this.cancelled.push(subscriptionId);
  }
  async portalUrl(input: { customerId: string }) {
    return `https://pay.test/portal/${input.customerId}`;
  }
  async parseEvent(rawBody: string, signature: string) {
    if (signature !== "valid") throw new Error("bad signature");
    return this.events[rawBody] ?? null;
  }
}

/** Runs connectors against canned responses; unknown URLs fail like an outage. */
export class FakeRuntime implements ConnectorRuntime {
  constructor(private readonly routes: Parameters<typeof fakeContext>[0] = {}) {}
  context(today: string): ConnectorContext {
    return fakeContext(this.routes, { today });
  }
}
