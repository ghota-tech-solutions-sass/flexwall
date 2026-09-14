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
