import type { ConnectorContext, SeriesPoint } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import type { AppLinks, BillingEvent, BillingPlan, CachedValues, CheckoutConsent, Clock, ConnectionRepository, ConnectorRuntime, CreditAccounts, EventLog, HandleRegistry, IdGenerator, Mail, Mailer, PaymentGateway, ReferralRepository, SecretBox, SnapshotStore, TokenService, UserRepository, ValueCache, WallRepository } from "@/application/ports";
import type { Connection } from "@/domain/connection";
import type { CreditEntry, CreditPack, SpendOutcome } from "@/domain/credits";
import type { Handle } from "@/domain/handle";
import type { Referral } from "@/domain/referral";
import type { User } from "@/domain/user";
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

/** Balances and entries in memory, with the store's rules: a day is charged once, taking back stops at zero. */
export class InMemoryCredits implements CreditAccounts {
  readonly balances = new Map<string, number>();
  readonly entries = new Map<string, CreditEntry>();
  constructor(private readonly clock: Clock = new FixedClock()) {}

  async balance(userId: string) {
    return this.balances.get(userId) ?? 0;
  }
  async spend(input: { userId: string; key: string; day: string; amount: number; detail: string }): Promise<SpendOutcome> {
    const id = `spend|${input.userId}|${input.key}|${input.day}`;
    if (this.entries.has(id)) return "already_paid";
    const balance = await this.balance(input.userId);
    if (balance < input.amount) return "insufficient";
    this.balances.set(input.userId, balance - input.amount);
    this.entries.set(id, { id, userId: input.userId, amount: -input.amount, reason: "spend", at: this.clock.now(), detail: input.detail });
    return "charged";
  }
  async release(input: { userId: string; key: string; day: string }) {
    const id = `spend|${input.userId}|${input.key}|${input.day}`;
    const entry = this.entries.get(id);
    if (!entry) return;
    this.balances.set(input.userId, (await this.balance(input.userId)) - entry.amount);
    this.entries.delete(id);
  }
  async adjust(input: { userId: string; entryId: string; amount: number; reason: Exclude<CreditEntry["reason"], "spend">; detail: string }) {
    const id = `${input.reason}|${input.entryId}`;
    if (this.entries.has(id)) return false;
    const balance = await this.balance(input.userId);
    const amount = Math.max(input.amount, -balance);
    this.balances.set(input.userId, balance + amount);
    this.entries.set(id, { id, userId: input.userId, amount, reason: input.reason, at: this.clock.now(), detail: input.detail });
    return true;
  }
  async history(userId: string, limit: number) {
    return [...this.entries.values()].filter((e) => e.userId === userId).sort((a, b) => b.at - a.at).slice(0, limit);
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
  creditsPurchased = () => `${this.origin}/settings?credits=1#credits`;
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
  readonly creditCheckouts: { userId: string; pack: CreditPack; consent: CheckoutConsent }[] = [];
  constructor(
    private readonly on = true,
    private readonly events: Record<string, BillingEvent | null> = {}
  ) {}
  enabled() {
    return this.on;
  }
  async checkoutUrl(input: { user: User; plan: BillingPlan; consent: CheckoutConsent; referralDiscount: boolean }) {
    this.checkouts.push({ userId: input.user.id, plan: input.plan, consent: input.consent, referralDiscount: input.referralDiscount });
    return { url: `https://pay.test/${input.plan}`, customerId: input.user.stripeCustomerId ?? `cus_${input.user.id}` };
  }
  async creditsCheckoutUrl(input: { user: User; pack: CreditPack; consent: CheckoutConsent }) {
    this.creditCheckouts.push({ userId: input.user.id, pack: input.pack, consent: input.consent });
    return { url: `https://pay.test/credits/${input.pack}`, customerId: input.user.stripeCustomerId ?? `cus_${input.user.id}` };
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
