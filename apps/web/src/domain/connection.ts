/**
 * Credentials for one account on one connector, owned by a user and usable by
 * any of their tiles. The secret is sealed before it reaches this type.
 */
export interface Connection {
  id: string;
  ownerId: string;
  connector: string;
  label: string;
  /** What the connector chose to show: key hint, account name, currency. */
  public: Record<string, string>;
  /** SecretBox output. Never leaves the server. */
  sealed: string;
  /** Upstream account id, so reconnecting the same account replaces the old connection. */
  accountId: string | null;
  createdAt: number;
  /** Epoch ms when the sealed credentials stop working; null (or absent in older records) when they don't expire. */
  expiresAt?: number | null;
}

/** How long before expiry credentials are renewed, so a render never starts with a token about to lapse. */
export const RENEW_BEFORE_EXPIRY_MS = 5 * 60_000;

/** Whether a connection's credentials need renewing at `now`. */
export function needsRenewal(connection: Pick<Connection, "expiresAt">, now: number): boolean {
  return typeof connection.expiresAt === "number" && now >= connection.expiresAt - RENEW_BEFORE_EXPIRY_MS;
}

/** How long a sign-in at a provider may take, from leaving Flexwall to coming back: a bank's own sign-in can be slow (Plaid allows 30 minutes). */
export const OAUTH_PENDING_TTL_MS = 30 * 60_000;

/**
 * A callback's query as the provider meant it. Some providers append their
 * own parameters with a second "?" to a return address that already has one
 * (".../callback?state=abc?status=SUCCESS"), which leaves them inside `state`.
 */
export function callbackQuery(params: Iterable<[string, string]>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, raw] of params) {
    const [value, ...rest] = raw.split("?");
    query[key] ??= value!;
    for (const [k, v] of new URLSearchParams(rest.join("&"))) query[k] ??= v;
  }
  return query;
}

/**
 * Where to send the owner back after signing in at a provider: a path on this
 * site only, so the callback can't be turned into an open redirect.
 */
export function safeReturnPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

/** What a browser may see of a connection. */
export interface ConnectionView {
  id: string;
  connector: string;
  label: string;
  public: Record<string, string>;
  createdAt: number;
}

export function viewOf(c: Connection): ConnectionView {
  return { id: c.id, connector: c.connector, label: c.label, public: c.public, createdAt: c.createdAt };
}
