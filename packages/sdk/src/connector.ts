import type { Tier } from "./tier";
import type { Field, FieldValues } from "./fields";
import type { Unit, Value, ValueType } from "./values";

/**
 * A connector is where values come from. It declares what it offers
 * (metrics, credentials, params) and how to fetch it. The host does the rest:
 * forms, validation, secret encryption, caching, single-flight, deadlines,
 * stale fallbacks, plan gating, history.
 */

export interface MetricDef {
  id: string;
  name: string;
  description?: string;
  type: ValueType;
  unit?: Unit;
  /** Public, per-tile settings, e.g. a repository name. Stored in the wall. */
  params?: Field[];
  /** Starting options for a tile showing this metric. */
  defaults?: { label?: string; prefix?: string; suffix?: string };
  /**
   * The Explore leaderboard this metric competes on. Revenue boards only count
   * values from verified connectors: typed numbers can't buy a rank.
   */
  leaderboard?: Leaderboard;
  /**
   * An amount about someone's own money: a balance, a portfolio, a net worth.
   * Public surfaces show it as a range ("$1M+") unless the owner asks a tile
   * for the exact number. Revenue isn't sensitive; wealth is.
   */
  sensitive?: boolean;
}

export type Leaderboard = "revenue" | "wealth" | "streak" | "audience" | "stars";

/** Boards that rank only values read from the owner's own account: a typed number or a pasted address can't buy a rank. */
export const VERIFIED_LEADERBOARDS: readonly Leaderboard[] = ["revenue", "wealth"];

export interface ConnectorAuth {
  /**
   * Credentials typed once per account. `secret` fields are encrypted. With
   * `oauth`, these are the choices made before leaving for the provider (a
   * country, a bank), often none.
   */
  fields: Field[];
  /** Where to get them and which permissions to grant. Plain text. */
  help: string;
  /** Button label, e.g. "Connect Stripe". */
  label?: string;
  /** Sign in at the provider instead of pasting a key. Replaces `connect`. */
  oauth?: ConnectorOAuth;
  /**
   * The owner removed the connection: revoke its tokens, delete the upstream
   * user or item that bills per connection. Best effort: the host removes the
   * connection whatever happens here, and logs failures.
   */
  disconnect?(input: { secret: Record<string, string>; public: Record<string, string> }, ctx: ConnectorContext): Promise<void>;
}

/**
 * A connection made by sending the owner to the provider and back. The host
 * keeps the state, the cookie and the callback route; the connector only knows
 * the provider's addresses and what its answers mean.
 */
export interface ConnectorOAuth {
  /**
   * Where to send the owner. `state` must travel to the provider and come back
   * untouched. `carry` is sealed in a short-lived cookie and handed to
   * `complete`: put a PKCE verifier there, never in the URL.
   */
  authorize(input: { fields: FieldValues; redirectUri: string; state: string }, ctx: ConnectorContext): Promise<{ url: string; carry?: Record<string, string> }>;
  /** The owner came back: `query` is the callback's query string. Throw ConnectorError when they declined. */
  complete(input: { fields: FieldValues; query: Record<string, string>; redirectUri: string; carry: Record<string, string> }, ctx: ConnectorContext): Promise<ConnectResult>;
  /**
   * Trades credentials for fresh ones before `expiresAt`, or when `fetch`
   * throws ExpiredCredentialsError. Omit when the provider can't renew: the
   * owner is asked to reconnect once they expire.
   */
  refresh?(input: { secret: Record<string, string>; public: Record<string, string> }, ctx: ConnectorContext): Promise<RefreshResult>;
}

export interface RefreshResult {
  secret: Record<string, string>;
  /** Replaces the stored public values when given. */
  public?: Record<string, string>;
  expiresAt?: number;
}

export interface ConnectResult {
  /** Encrypted by the host, handed back to `fetch` only. */
  secret: Record<string, string>;
  /** Shown to the owner: account name, key hint, currency. Never secrets. */
  public: Record<string, string>;
  /** Short name in connection lists, e.g. "Acme Inc (live)". */
  label: string;
  /** Stable upstream account id, so reconnecting the same account replaces the old connection. */
  accountId?: string;
  /** Epoch ms when the credentials stop working: an OAuth access token, a bank consent. */
  expiresAt?: number;
}

export interface FetchRequest {
  /** Every metric of this cache group some tile needs. Return as many as one call can answer. */
  metrics: string[];
  params: FieldValues;
  secret: Record<string, string> | null;
  public: Record<string, string> | null;
}

export type FetchResult = Partial<Record<string, Value | null>>;

export interface GuardedFetchInit {
  /** DELETE is for `disconnect`: removing what a connection created upstream. Read a 204 with `text`. */
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  /** Default 1 MB, host maximum 4 MB. */
  maxBytes?: number;
  /** Default 6 s, host maximum 15 s. */
  timeoutMs?: number;
}

/**
 * The only way a connector reaches the network. The host implementation
 * refuses private and metadata addresses at connect time, refuses redirects,
 * and caps size and time.
 */
export interface GuardedFetch {
  json<T = unknown>(url: string, init?: GuardedFetchInit): Promise<T>;
  text(url: string, init?: GuardedFetchInit): Promise<string>;
}

export interface ConnectorContext {
  fetch: GuardedFetch;
  /** Owner's today, YYYY-MM-DD. */
  today: string;
  /** Server-side configuration the host chose to expose, e.g. GITHUB_TOKEN. Undefined when unset. */
  env(name: string): string | undefined;
  log(message: string): void;
}

export interface ConnectorDef {
  /** Unique across all plugins. Lowercase, digits, dashes. */
  id: string;
  name: string;
  description: string;
  homepage?: string;
  /** 24×24 SVG path, drawn in the connector's badge. */
  icon?: string;
  /** "pro" connectors render on public walls only for paying owners. */
  tier: Tier;
  /** True when values come from the owner's own authenticated account. Earns the verified badge. */
  verified: boolean;
  /** Omit for public data that needs no account. */
  auth?: ConnectorAuth;
  metrics: MetricDef[];
  /** Seconds a fetched value stays fresh. */
  ttl: number;
  /**
   * A connection's own freshness, from its public values: lets an owner who
   * pays per call (their own X key) choose how often to refresh. Never below `ttl`.
   */
  ttlFor?(connection: Record<string, string>): number;
  /**
   * Metrics with the same key are fetched together. Default: one group per
   * metric and params. Return a constant when one call answers every metric.
   */
  cacheKey?(req: { metric: string; params: FieldValues }): string;
  connect?(input: FieldValues, ctx: ConnectorContext): Promise<ConnectResult>;
  fetch(req: FetchRequest, ctx: ConnectorContext): Promise<FetchResult>;
  /** Plausible values for previews and marketing. Must cover every metric. */
  sample: Record<string, Value>;
}

/** Thrown by `ctx.fetch` for any answer outside 2xx, so connectors can tell a revoked key (401/403) from an outage. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.name = "HttpError";
  }

  // Bundlers can load this package more than once; recognise errors by shape, not identity.
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === "HttpError" && typeof (value as { status?: unknown }).status === "number";
  }
}

export type BlockedReason = "private-address" | "redirect" | "too-large" | "timeout" | "invalid-url" | "network";

/**
 * Thrown by `ctx.fetch` when the host refuses or can't complete a request.
 * `reason` tells cases apart; `message` is a lowercase fragment safe to show
 * after a subject: `The endpoint ${error.message}.`
 */
export class BlockedRequestError extends Error {
  constructor(
    message: string,
    readonly reason: BlockedReason = "network"
  ) {
    super(message);
    this.name = "BlockedRequestError";
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === "BlockedRequestError";
  }
}

/**
 * Thrown by `fetch` when the provider says the credentials expired. The host
 * refreshes them through `auth.oauth.refresh` and tries once more.
 */
export class ExpiredCredentialsError extends Error {
  constructor(message = "The credentials expired.") {
    super(message);
    this.name = "ExpiredCredentialsError";
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === "ExpiredCredentialsError";
  }
}

/** A failure the owner can fix. The message is shown as is: one plain sentence. */
export class ConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorError";
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === "ConnectorError";
  }
}

export function defineConnector(def: ConnectorDef): ConnectorDef {
  return def;
}

/**
 * One group per metric and params, values kept exactly as typed: "JSONStream"
 * and "jsonstream" are different npm packages. Connectors whose upstream is
 * case-insensitive normalize in their own `cacheKey`.
 */
export function defaultCacheKey(req: { metric: string; params: FieldValues }): string {
  const params = Object.keys(req.params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(req.params[k]))}`)
    .join("&");
  return `${req.metric}?${params}`;
}
