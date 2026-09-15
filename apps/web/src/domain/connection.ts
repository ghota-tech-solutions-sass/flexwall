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

/** How long a sign-in at a provider may take, from leaving Flexwall to coming back. */
export const OAUTH_PENDING_TTL_MS = 10 * 60_000;

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
