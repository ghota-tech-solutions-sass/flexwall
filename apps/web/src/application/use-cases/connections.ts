import { BlockedRequestError, ConnectorError, HttpError, splitSecrets, validateFields } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import { viewOf, type ConnectionView } from "@/domain/connection";
import { DomainError, forbidden, invalid, notFound } from "@/domain/errors";
import { todayIn } from "@/domain/time";
import type { Clock, ConnectionRepository, ConnectorRuntime, IdGenerator, SecretBox, UserRepository } from "../ports";

export const MAX_CONNECTIONS = 20;

/**
 * Tests credentials with the connector, then stores them sealed. What the
 * connector returns as `secret` is encrypted; `public` is what the owner sees.
 * Reconnecting the same upstream account replaces the previous connection.
 */
export class ConnectAccount {
  constructor(
    private readonly deps: {
      users: UserRepository;
      connections: ConnectionRepository;
      catalog: Catalog;
      runtime: ConnectorRuntime;
      secrets: SecretBox;
      ids: IdGenerator;
      clock: Clock;
    }
  ) {}

  async execute(input: { userId: string; connector: string; values: Record<string, unknown> }): Promise<ConnectionView> {
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    const connector = this.deps.catalog.connector(input.connector);
    if (!connector) throw notFound(`Connector "${input.connector}"`);
    if (!connector.auth || !connector.connect) throw invalid(`${connector.name} doesn't need an account.`);

    const existing = await this.deps.connections.byOwner(user.id);
    if (existing.length >= MAX_CONNECTIONS) throw new DomainError("plan_limit", `You can keep ${MAX_CONNECTIONS} connections.`);

    const checked = validateFields(connector.auth.fields, input.values);
    if (checked.error) throw invalid(checked.error);

    const now = this.deps.clock.now();
    let result;
    try {
      result = await connector.connect(checked.values, this.deps.runtime.context(todayIn(user.timeZone, now)));
    } catch (error) {
      if (error instanceof ConnectorError) throw new DomainError("connection_failed", error.message);
      if (error instanceof BlockedRequestError) throw new DomainError("connection_failed", `${connector.name}: the request ${error.message}.`);
      if (error instanceof HttpError) throw new DomainError("connection_failed", `${connector.name} answered HTTP ${error.status}.`);
      throw error;
    }

    // Anything the form marked secret stays secret even if a connector forgot to move it.
    const { secret: formSecrets } = splitSecrets(connector.auth.fields, checked.values);
    const sealed = this.deps.secrets.seal({ ...formSecrets, ...result.secret });
    const replaced = result.accountId ? existing.find((c) => c.connector === connector.id && c.accountId === result.accountId) : undefined;

    const connection = {
      id: replaced?.id ?? this.deps.ids.next(),
      ownerId: user.id,
      connector: connector.id,
      label: result.label.slice(0, 80),
      public: result.public,
      sealed,
      accountId: result.accountId ?? null,
      createdAt: replaced?.createdAt ?? now,
    };
    await this.deps.connections.save(connection);
    return viewOf(connection);
  }
}

export class RemoveConnection {
  constructor(private readonly deps: { connections: ConnectionRepository }) {}

  async execute(input: { userId: string; connectionId: string }): Promise<void> {
    const connection = await this.deps.connections.byId(input.connectionId);
    if (!connection) throw notFound("This connection");
    if (connection.ownerId !== input.userId) throw forbidden();
    await this.deps.connections.delete(connection.id);
  }
}
