import { BlockedRequestError, ConnectorError, HttpError, splitSecrets, validateFields, type ConnectorDef, type ConnectResult, type FieldValues } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import { normalizeNickname, OAUTH_PENDING_TTL_MS, safeReturnPath, viewOf, type Connection, type ConnectionView } from "@/domain/connection";
import { DomainError, forbidden, invalid, notFound } from "@/domain/errors";
import { todayIn } from "@/domain/time";
import type { User } from "@/domain/user";
import type { AppLinks, Clock, ConnectionRepository, ConnectorRuntime, IdGenerator, SecretBox, UserRepository } from "../ports";

export const MAX_CONNECTIONS = 20;

interface ConnectionDeps {
  users: UserRepository;
  connections: ConnectionRepository;
  catalog: Catalog;
  runtime: ConnectorRuntime;
  secrets: SecretBox;
  ids: IdGenerator;
  clock: Clock;
}

/** The owner, the connector and room for one more connection, or the reason not. */
async function prepare(deps: ConnectionDeps, userId: string, connectorId: string): Promise<{ user: User; connector: ConnectorDef; existing: Connection[] }> {
  const user = await deps.users.byId(userId);
  if (!user) throw new DomainError("unauthenticated", "Sign in again.");
  const connector = deps.catalog.connector(connectorId);
  if (!connector) throw notFound(`Connector "${connectorId}"`);
  if (!connector.auth) throw invalid(`${connector.name} doesn't need an account.`);
  const existing = await deps.connections.byOwner(user.id);
  if (existing.length >= MAX_CONNECTIONS) throw new DomainError("plan_limit", `You can keep ${MAX_CONNECTIONS} connections.`);
  return { user, connector, existing };
}

/** What a connector threw while connecting, as a sentence for the owner. Anything else is ours to log. */
function connectionFailure(connector: ConnectorDef, error: unknown): unknown {
  if (error instanceof ConnectorError) return new DomainError("connection_failed", error.message);
  if (error instanceof BlockedRequestError) return new DomainError("connection_failed", `${connector.name}: the request ${error.message}.`);
  if (error instanceof HttpError) return new DomainError("connection_failed", `${connector.name} answered HTTP ${error.status}.`);
  return error;
}

/** Seals what the connector returned and saves it. Reconnecting the same upstream account replaces the previous connection. */
async function store(deps: ConnectionDeps, input: { user: User; connector: ConnectorDef; existing: Connection[]; result: ConnectResult; formSecrets: Record<string, string> }): Promise<ConnectionView> {
  const { user, connector, existing, result } = input;
  const now = deps.clock.now();
  const sealed = deps.secrets.seal({ ...input.formSecrets, ...result.secret });
  const replaced = result.accountId ? existing.find((c) => c.connector === connector.id && c.accountId === result.accountId) : undefined;
  const connection: Connection = {
    id: replaced?.id ?? deps.ids.next(),
    ownerId: user.id,
    connector: connector.id,
    label: result.label.slice(0, 80),
    public: result.public,
    sealed,
    accountId: result.accountId ?? null,
    createdAt: replaced?.createdAt ?? now,
    expiresAt: result.expiresAt ?? null,
    // The owner named this account; fresh credentials for it don't change what they call it.
    nickname: replaced?.nickname ?? null,
  };
  await deps.connections.save(connection);
  return viewOf(connection);
}

/**
 * Tests credentials with the connector, then stores them sealed. What the
 * connector returns as `secret` is encrypted; `public` is what the owner sees.
 * Reconnecting the same upstream account replaces the previous connection.
 */
export class ConnectAccount {
  constructor(private readonly deps: ConnectionDeps) {}

  async execute(input: { userId: string; connector: string; values: Record<string, unknown> }): Promise<ConnectionView> {
    const { user, connector, existing } = await prepare(this.deps, input.userId, input.connector);
    if (!connector.connect) throw invalid(`${connector.name} connects by signing in at ${connector.name}.`);

    const checked = validateFields(connector.auth!.fields, input.values);
    if (checked.error) throw invalid(checked.error);

    let result;
    try {
      result = await connector.connect(checked.values, this.deps.runtime.context(todayIn(user.timeZone, this.deps.clock.now())));
    } catch (error) {
      throw connectionFailure(connector, error);
    }

    // Anything the form marked secret stays secret even if a connector forgot to move it.
    const { secret: formSecrets } = splitSecrets(connector.auth!.fields, checked.values);
    return store(this.deps, { user, connector, existing, result, formSecrets });
  }
}

/** A sign-in in progress, sealed into a cookie while the owner is at the provider. */
interface PendingSignIn {
  state: string;
  userId: string;
  connector: string;
  fields: FieldValues;
  carry: Record<string, string>;
  returnTo: string;
  startedAt: number;
}

const PENDING_KEY = "pending";

/**
 * First half of connecting through a provider's sign-in: checks the choices
 * made on Flexwall, asks the connector where to send the owner, and seals what
 * the way back needs. The caller keeps `pending` in an HttpOnly cookie.
 */
export class StartConnectionSignIn {
  constructor(private readonly deps: ConnectionDeps & { links: AppLinks }) {}

  async execute(input: { userId: string; connector: string; values: Record<string, unknown>; returnTo: unknown; fallbackReturn: string }): Promise<{ url: string; pending: string }> {
    const { user, connector } = await prepare(this.deps, input.userId, input.connector);
    const oauth = connector.auth!.oauth;
    if (!oauth) throw invalid(`${connector.name} connects with a key, not a sign-in.`);

    const checked = validateFields(connector.auth!.fields, input.values);
    if (checked.error) throw invalid(checked.error);

    // Two ids: about 140 bits, so a state can't be guessed while a sign-in is open.
    const state = this.deps.ids.next() + this.deps.ids.next();
    let started;
    try {
      started = await oauth.authorize({ fields: checked.values, redirectUri: this.deps.links.oauthCallback(), state }, this.deps.runtime.context(todayIn(user.timeZone, this.deps.clock.now())));
    } catch (error) {
      throw connectionFailure(connector, error);
    }
    if (!/^https:\/\//.test(started.url)) throw new DomainError("connection_failed", `${connector.name} didn't give a secure address to sign in at.`);

    const pending: PendingSignIn = {
      state,
      userId: user.id,
      connector: connector.id,
      fields: checked.values,
      carry: started.carry ?? {},
      returnTo: safeReturnPath(input.returnTo, input.fallbackReturn),
      startedAt: this.deps.clock.now(),
    };
    return { url: started.url, pending: this.deps.secrets.seal({ [PENDING_KEY]: JSON.stringify(pending) }) };
  }
}

/**
 * Second half: the provider sent the owner back. The pending sign-in must be
 * this owner's, recent, and carry the same state the provider returned; then
 * the connector trades the callback for credentials, stored like any other.
 */
export class FinishConnectionSignIn {
  constructor(private readonly deps: ConnectionDeps & { links: AppLinks }) {}

  /** Where to send the owner back, even when the sign-in failed, so the error shows where they started. */
  returnPathOf(pending: string | undefined, fallback: string): string {
    const opened = this.open(pending);
    return opened ? opened.returnTo : fallback;
  }

  async execute(input: { userId: string; pending: string | undefined; query: Record<string, string> }): Promise<{ connection: ConnectionView; returnTo: string }> {
    const pending = this.open(input.pending);
    if (!pending || this.deps.clock.now() - pending.startedAt > OAUTH_PENDING_TTL_MS) throw invalid("This sign-in expired. Start connecting again.");
    if (pending.userId !== input.userId) throw forbidden("This sign-in was started by another account.");
    if (!input.query.state || input.query.state !== pending.state) throw invalid("This sign-in didn't come back from where it started. Start connecting again.");

    const { user, connector, existing } = await prepare(this.deps, input.userId, pending.connector);
    const oauth = connector.auth!.oauth;
    if (!oauth) throw invalid(`${connector.name} connects with a key, not a sign-in.`);

    let result;
    try {
      result = await oauth.complete(
        { fields: pending.fields, query: input.query, redirectUri: this.deps.links.oauthCallback(), carry: pending.carry },
        this.deps.runtime.context(todayIn(user.timeZone, this.deps.clock.now()))
      );
    } catch (error) {
      throw connectionFailure(connector, error);
    }
    const connection = await store(this.deps, { user, connector, existing, result, formSecrets: {} });
    return { connection, returnTo: pending.returnTo };
  }

  private open(sealed: string | undefined): PendingSignIn | null {
    if (!sealed) return null;
    try {
      return JSON.parse(this.deps.secrets.open(sealed)[PENDING_KEY] ?? "null") as PendingSignIn | null;
    } catch {
      return null;
    }
  }
}

/**
 * Names a connection the way its owner tells it apart from their other
 * accounts. An empty name clears it, so the connector's label shows again.
 */
export class RenameConnection {
  constructor(private readonly deps: { connections: ConnectionRepository }) {}

  async execute(input: { userId: string; connectionId: string; nickname: unknown }): Promise<ConnectionView> {
    if (input.nickname !== null && input.nickname !== undefined && typeof input.nickname !== "string") throw invalid("Send a name, or an empty one to clear it.");
    const connection = await this.deps.connections.byId(input.connectionId);
    if (!connection) throw notFound("This connection");
    if (connection.ownerId !== input.userId) throw forbidden();
    const renamed: Connection = { ...connection, nickname: normalizeNickname(input.nickname) };
    await this.deps.connections.save(renamed);
    return viewOf(renamed);
  }
}

/** How long removing a connection waits for the provider to let go of it. */
export const DISCONNECT_DEADLINE_MS = 5000;

/**
 * Removes a connection, and first asks the connector to let go of it
 * upstream: revoke tokens, delete the user or item billed per connection.
 * That part is best effort: a provider that's down or refuses never keeps
 * the owner from removing their account.
 */
export class RemoveConnection {
  constructor(private readonly deps: { connections: ConnectionRepository; catalog: Catalog; secrets: SecretBox; runtime: ConnectorRuntime; clock: Clock; log?: (message: string) => void }) {}

  async execute(input: { userId: string; connectionId: string }): Promise<void> {
    const connection = await this.deps.connections.byId(input.connectionId);
    if (!connection) throw notFound("This connection");
    if (connection.ownerId !== input.userId) throw forbidden();
    await this.letGo(connection);
    await this.deps.connections.delete(connection.id);
  }

  private async letGo(connection: Connection): Promise<void> {
    const disconnect = this.deps.catalog.connector(connection.connector)?.auth?.disconnect;
    if (!disconnect) return;
    const log = this.deps.log ?? ((message: string) => console.log(message));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const secret = this.deps.secrets.open(connection.sealed);
      const today = new Date(this.deps.clock.now()).toISOString().slice(0, 10);
      await Promise.race([
        disconnect({ secret, public: connection.public }, this.deps.runtime.context(today)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no answer within ${DISCONNECT_DEADLINE_MS}ms`)), DISCONNECT_DEADLINE_MS);
        }),
      ]);
    } catch (error) {
      log(`[connections] ${connection.connector} didn't let go of connection ${connection.id} upstream: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
