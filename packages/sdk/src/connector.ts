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
}

export interface ConnectorAuth {
  /** Credentials typed once per account. `secret` fields are encrypted. */
  fields: Field[];
  /** Where to get them and which permissions to grant. Plain text. */
  help: string;
  /** Button label, e.g. "Connect Stripe". */
  label?: string;
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
  method?: "GET" | "POST";
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
  tier: "free" | "pro";
  /** True when values come from the owner's own authenticated account. Earns the verified badge. */
  verified: boolean;
  /** Omit for public data that needs no account. */
  auth?: ConnectorAuth;
  metrics: MetricDef[];
  /** Seconds a fetched value stays fresh. */
  ttl: number;
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
}

/** Thrown by `ctx.fetch` when the host refuses a request: private address, redirect, too big, too slow. */
export class BlockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedRequestError";
  }
}

/** A failure the owner can fix. The message is shown as is: one plain sentence. */
export class ConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorError";
  }
}

export function defineConnector(def: ConnectorDef): ConnectorDef {
  return def;
}

export function defaultCacheKey(req: { metric: string; params: FieldValues }): string {
  const params = Object.keys(req.params)
    .sort()
    .map((k) => `${k}=${String(req.params[k]).toLowerCase()}`)
    .join("&");
  return `${req.metric}?${params}`;
}
