import type { Value } from "@flexwall/sdk";
import type { Connection } from "@/domain/connection";
import type { Handle } from "@/domain/handle";
import type { Box } from "@/domain/layout";
import type { Referral, ReferralStatus } from "@/domain/referral";
import type { Subscription, User } from "@/domain/user";
import type { Binding, Tile, Visibility, Wall, WallDraft } from "@/domain/wall";

/**
 * Fluent builders for domain entities. Defaults describe a valid, boring
 * object; tests state only what matters to them.
 *
 *   aWall().ownedBy(user).with(aTile().stat().static(money(10, "usd"))).build()
 */

const NOW = Date.UTC(2026, 8, 14, 9, 0, 0);

export class UserBuilder {
  private user: User = {
    id: "user-1",
    email: "ada@example.com",
    handle: "ada" as Handle,
    timeZone: "Europe/Paris",
    createdAt: NOW,
    stripeCustomerId: null,
    subscription: null,
    lifetime: false,
    referredBy: null,
    bonusProUntil: null,
  };
  withId(id: string) {
    this.user.id = id;
    return this;
  }
  referredBy(userId: string) {
    this.user.referredBy = userId;
    return this;
  }
  offeredPro(until: number | null, by = "admin@flexwall.lol") {
    this.user.complimentary = { until, grantedAt: NOW, grantedBy: by, note: "" };
    return this;
  }
  withBonusProUntil(at: number | null) {
    this.user.bonusProUntil = at;
    return this;
  }
  withEmail(email: string) {
    this.user.email = email;
    return this;
  }
  withHandle(handle: string | null) {
    this.user.handle = handle as Handle | null;
    return this;
  }
  inTimeZone(tz: string) {
    this.user.timeZone = tz;
    return this;
  }
  withStripeCustomer(id: string) {
    this.user.stripeCustomerId = id;
    return this;
  }
  pro(over: Partial<Subscription> = {}) {
    this.user.subscription = aSubscription().with(over).build();
    return this;
  }
  lifetime() {
    this.user.lifetime = true;
    return this;
  }
  build(): User {
    return structuredClone(this.user);
  }
}

export class SubscriptionBuilder {
  private sub: Subscription = { id: "sub_1", status: "active", interval: "month", currentPeriodEnd: NOW + 30 * 86_400_000, cancelAtPeriodEnd: false };
  with(over: Partial<Subscription>) {
    Object.assign(this.sub, over);
    return this;
  }
  build(): Subscription {
    return { ...this.sub };
  }
}

let tileSeq = 0;

export class TileBuilder {
  private tile: Tile = { id: `tile-${++tileSeq}`, widget: "note", inputs: {}, options: { title: "Hello" }, visibility: "public", layout: { x: 0, y: 0, w: 2, h: 1 } };
  withId(id: string) {
    this.tile.id = id;
    return this;
  }
  widget(id: string, options: Tile["options"] = {}) {
    this.tile.widget = id;
    this.tile.options = options;
    return this;
  }
  note(title = "Hello") {
    return this.widget("note", { title });
  }
  stat(options: Tile["options"] = { label: "MRR" }) {
    return this.widget("stat", options);
  }
  at(x: number, y: number, w = this.tile.layout.w, h = this.tile.layout.h) {
    this.tile.layout = { x, y, w, h };
    return this;
  }
  sized(w: number, h: number) {
    this.tile.layout = { ...this.tile.layout, w, h };
    return this;
  }
  visibility(v: Visibility) {
    this.tile.visibility = v;
    return this;
  }
  private() {
    return this.visibility("private");
  }
  input(key: string, binding: Binding) {
    this.tile.inputs[key] = binding;
    return this;
  }
  static(value: Value, key = "value") {
    return this.input(key, { kind: "static", value });
  }
  metric(connector: string, metric: string, over: Partial<Extract<Binding, { kind: "metric" }>> = {}, key = "value") {
    return this.input(key, { kind: "metric", connector, metric, params: {}, connection: null, history: null, ...over });
  }
  build(): Tile {
    return structuredClone(this.tile);
  }
}

export class WallBuilder {
  private wall: Wall = {
    id: "wall-1",
    ownerId: "user-1",
    handle: "ada" as Handle,
    title: "Ada",
    bio: "",
    theme: "night",
    tiles: [],
    lockscreen: { device: "iphone-17-pro", placements: [] },
    lockNonce: "nonce-1",
    published: true,
    listed: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  withId(id: string) {
    this.wall.id = id;
    return this;
  }
  ownedBy(user: Pick<User, "id" | "handle">) {
    this.wall.ownerId = user.id;
    if (user.handle) this.wall.handle = user.handle;
    return this;
  }
  with(...tiles: (Tile | TileBuilder)[]) {
    this.wall.tiles.push(...tiles.map((t) => (t instanceof TileBuilder ? t.build() : t)));
    return this;
  }
  theme(id: string) {
    this.wall.theme = id;
    return this;
  }
  unpublished() {
    this.wall.published = false;
    this.wall.listed = false;
    return this;
  }
  listed() {
    this.wall.published = true;
    this.wall.listed = true;
    return this;
  }
  onLockscreen(tileId: string, box: Box) {
    this.wall.lockscreen.placements.push({ tileId, box });
    return this;
  }
  updatedAt(ms: number) {
    this.wall.updatedAt = ms;
    return this;
  }
  build(): Wall {
    return structuredClone(this.wall);
  }
  /** The editor payload that would produce this wall. */
  draft(): WallDraft {
    const w = this.build();
    return { title: w.title, bio: w.bio, theme: w.theme, tiles: w.tiles, lockscreen: w.lockscreen, published: w.published, listed: w.listed };
  }
}

export class ConnectionBuilder {
  private connection: Connection = {
    id: "conn-1",
    ownerId: "user-1",
    connector: "stripe",
    label: "Stripe live (USD)",
    public: { hint: "rk_live_…abcd" },
    sealed: 'sealed:{"key":"rk_live_abcdefghijkl"}',
    accountId: null,
    createdAt: NOW,
  };
  withId(id: string) {
    this.connection.id = id;
    return this;
  }
  ownedBy(user: Pick<User, "id">) {
    this.connection.ownerId = user.id;
    return this;
  }
  forConnector(id: string) {
    this.connection.connector = id;
    return this;
  }
  withLabel(label: string) {
    this.connection.label = label;
    return this;
  }
  sealed(value: string) {
    this.connection.sealed = value;
    return this;
  }
  withPublic(values: Record<string, string>) {
    this.connection.public = values;
    return this;
  }
  expiringAt(epochMs: number) {
    this.connection.expiresAt = epochMs;
    return this;
  }
  /** Left out by default, like documents saved before owners could name accounts. */
  named(nickname: string | null) {
    this.connection.nickname = nickname;
    return this;
  }
  connectedAt(epochMs: number) {
    this.connection.createdAt = epochMs;
    return this;
  }
  build(): Connection {
    return structuredClone(this.connection);
  }
}

export const aUser = () => new UserBuilder();
export const aSubscription = () => new SubscriptionBuilder();
export const aTile = () => new TileBuilder();
export const aWall = () => new WallBuilder();
export const aConnection = () => new ConnectionBuilder();
export class ReferralBuilder {
  private referral: Referral = { id: "referee-1", referrerId: "referrer-1", refereeId: "referee-1", createdAt: NOW, status: "signed_up", convertedAt: null, rewarded: false };
  from(referrerId: string) {
    this.referral.referrerId = referrerId;
    return this;
  }
  to(refereeId: string) {
    this.referral.id = refereeId;
    this.referral.refereeId = refereeId;
    return this;
  }
  converted(at = NOW, rewarded = true) {
    this.referral.status = "converted";
    this.referral.convertedAt = at;
    this.referral.rewarded = rewarded;
    return this;
  }
  withStatus(status: ReferralStatus) {
    this.referral.status = status;
    return this;
  }
  build(): Referral {
    return { ...this.referral };
  }
}

export const aReferral = () => new ReferralBuilder();

export { NOW };
