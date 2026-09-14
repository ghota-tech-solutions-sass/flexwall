import type { ConnectorSpec } from "@/lib/connectors/catalog";

/**
 * The server half of a connector. The catalog says what it offers; this says
 * how to get the numbers. Everything else (validation, secret encryption,
 * caching, Pro gating, degrading to "–") lives in the resolver, not here.
 */

/** A connection as a connector sees it: decrypted secret fields plus the public ones. */
export interface ConnectionData {
  secret: Record<string, string>;
  public: Record<string, string>;
}

export interface ConnectResult {
  /** Encrypted before storage, never returned to the browser. */
  secret: Record<string, string>;
  /** Shown to the owner in the editor ("rk_live_…9fQa", "api.example.com"). */
  public: Record<string, string>;
  /** Short name for the connection list. */
  label: string;
  /** Values read while verifying, so the first preview doesn't need a second round trip. */
  values?: Values;
}

/** field id → number. `null` means "the upstream answered, but has no value for this". */
export type Values = Record<string, number | null>;

export interface FetchRequest {
  field: string;
  params: Record<string, string>;
  connection: ConnectionData | null;
  today: string;
}

export interface Connector {
  spec: ConnectorSpec;
  /** How long fetched values stay fresh. Shortcuts ask once a day; the editor asks constantly. */
  ttlMs: number;
  /**
   * Values that share one upstream call share a key, so they're fetched and
   * cached together (all Stripe metrics come from one pass over the account).
   * Must include everything that changes the answer. The resolver adds the
   * connection id.
   */
  cacheKey(req: Pick<FetchRequest, "field" | "params">): string;
  fetch(req: FetchRequest): Promise<Values>;
  /** Validates and tests credentials the owner typed. Throws ConnectorError with a sentence to show. */
  connect?(input: Record<string, string>): Promise<ConnectResult>;
  /** Plausible numbers for marketing samples. */
  sample(field: string): number;
}

/** A failure worth showing to the owner as is ("the key is missing Balance read access"). */
export class ConnectorError extends Error {}
