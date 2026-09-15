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
  /** The owner's own name for it, to tell accounts of one connector apart. Null, or absent in older records, when unnamed. */
  nickname?: string | null;
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
  /** The owner's own name for it; null when they haven't named it. */
  nickname?: string | null;
  /** When the credentials stop working, so the owner can be told before they do. */
  expiresAt?: number | null;
}

export function viewOf(c: Connection): ConnectionView {
  return { id: c.id, connector: c.connector, label: c.label, public: c.public, createdAt: c.createdAt, nickname: c.nickname ?? null, expiresAt: c.expiresAt ?? null };
}

export const NICKNAME_MAX = 40;

/** A nickname as stored: trimmed, at most NICKNAME_MAX characters, and null when nothing is left. */
export function normalizeNickname(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().slice(0, NICKNAME_MAX).trim();
  return trimmed || null;
}

/** What a connection goes by: the owner's nickname, else what the connector called it. */
export function connectionName(view: Pick<ConnectionView, "label" | "nickname">, connectorName?: string): string {
  return view.nickname || view.label || connectorName || "Account";
}

/** How many facts the detail line holds, so it stays one short line. */
const DETAIL_PARTS = 2;

/**
 * A short line telling an account apart, from the public values connectors
 * commonly give: who, where, how many, which key, in what currency. Facts the
 * name already says are left out. Public values are never secrets.
 */
export function connectionDetail(view: Pick<ConnectionView, "label" | "nickname" | "public">): string {
  const pub = view.public;
  const handle = pub.handle || pub.username || pub.login;
  // Only a count reads as "N accounts": nothing else belongs there, and a stray value shouldn't read as one.
  const count = pub.accounts && /^\d+$/.test(pub.accounts) ? Number(pub.accounts) : null;
  const facts = [
    handle ? `@${handle.replace(/^@/, "")}` : "",
    pub.institution || pub.bank || pub.banks || pub.brokerages || "",
    count === null ? "" : `${count} ${count === 1 ? "account" : "accounts"}`,
    pub.hint || "",
    pub.currency ? pub.currency.toUpperCase() : "",
  ];
  const name = connectionName(view).toLowerCase();
  return facts
    .filter((fact) => fact && !name.includes(fact.toLowerCase()))
    .slice(0, DETAIL_PARTS)
    .join(" · ");
}

/** A connection's name split from the number that tells it apart, so a list can cut a long name and still show the number. */
export interface DisplayName {
  name: string;
  /** 1, 2… when another account of the same connector reads the same; else null. */
  number: number | null;
}

export type ConnectorNames = (connectorId: string) => string | undefined;

/** Names and numbers by connection id: accounts of one connector that would read the same are numbered in the order they were connected. */
export function displayNames(views: readonly ConnectionView[], connectorName: ConnectorNames = () => undefined): Record<string, DisplayName> {
  const groups = new Map<string, ConnectionView[]>();
  for (const view of views) {
    const key = JSON.stringify([view.connector, connectionName(view, connectorName(view.connector)).toLowerCase()]);
    groups.set(key, [...(groups.get(key) ?? []), view]);
  }
  const names: Record<string, DisplayName> = {};
  for (const group of groups.values()) {
    // Same instant (imports, tests): the id keeps the numbering stable.
    const ordered = [...group].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    ordered.forEach((view, i) => {
      names[view.id] = { name: connectionName(view, connectorName(view.connector)), number: ordered.length > 1 ? i + 1 : null };
    });
  }
  return names;
}

export function displayNameText({ name, number }: DisplayName): string {
  return number === null ? name : `${name} · ${number}`;
}

/** Display names by connection id, as one string each: "Acme · 1", "Acme · 2". */
export function disambiguate(views: readonly ConnectionView[], connectorName: ConnectorNames = () => undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(displayNames(views, connectorName)).map(([id, shown]) => [id, displayNameText(shown)]));
}

/** Whether credentials keep working: renewed on their own, good until a date, or already lapsed. Null when they don't expire. */
export type CredentialsState = { kind: "renews" } | { kind: "expires"; at: number } | { kind: "expired"; at: number } | null;

export function credentialsState(view: Pick<ConnectionView, "expiresAt">, renews: boolean, now: number): CredentialsState {
  if (typeof view.expiresAt !== "number") return null;
  if (renews) return { kind: "renews" };
  return view.expiresAt <= now ? { kind: "expired", at: view.expiresAt } : { kind: "expires", at: view.expiresAt };
}
