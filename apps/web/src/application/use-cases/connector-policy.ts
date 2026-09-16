import type { ServerStatus, Tier } from "@flexwall/sdk";
import { isAdministrator } from "@/domain/admin";
import type { BrowsableCatalog } from "@/domain/catalog";
import {
  DEFAULT_AVAILABILITY,
  effectiveAvailability,
  isAvailability,
  overrideOf,
  visibleTo,
  type Availability,
  type ConnectorPolicy,
  type PolicyOverride,
} from "@/domain/connector-policy";
import { invalid, notFound } from "@/domain/errors";
import { todayIn } from "@/domain/time";
import type { User } from "@/domain/user";
import type { Clock, ConnectionRepository, ConnectorAvailability, ConnectorPolicies, ConnectorRuntime, UserRepository } from "../ports";

/** How long an instance trusts what it read: a wall render must not cost a store read per tile. */
export const POLICY_CACHE_MS = 60_000;

/** Connections the administration counts at most, like ADMIN_LIST_LIMIT for accounts. */
export const CONNECTION_COUNT_LIMIT = 5000;

interface AccessDeps {
  catalog: BrowsableCatalog;
  policies: ConnectorPolicies;
  runtime: ConnectorRuntime;
  clock: Clock;
}

/**
 * Who may use each connector, from the server's own credentials and what
 * administrators chose. Read on every wall render, so it keeps its answer for a
 * minute; a change from the back office clears the instance that made it and
 * reaches the others within that minute.
 */
export class ConnectorAccess implements ConnectorAvailability {
  private cache: { at: number; value: Record<string, Availability> } | null = null;

  constructor(private readonly deps: AccessDeps) {}

  /** The status of every connector that needs server credentials, by id. */
  statuses(): Record<string, ServerStatus | null> {
    const ctx = this.deps.runtime.context(todayIn("UTC", this.deps.clock.now()));
    const out: Record<string, ServerStatus | null> = {};
    for (const connector of this.deps.catalog.connectors()) {
      try {
        out[connector.id] = connector.server ? connector.server(ctx) : null;
      } catch {
        // A connector that can't answer is treated as unconfigured: better dark than wrong.
        out[connector.id] = { configured: false, environment: "sandbox", detail: "This connector couldn't read its settings." };
      }
    }
    return out;
  }

  async all(): Promise<Record<string, Availability>> {
    const now = this.deps.clock.now();
    if (this.cache && now - this.cache.at < POLICY_CACHE_MS) return this.cache.value;
    const value = await this.compute();
    this.cache = { at: now, value };
    return value;
  }

  /** Forgets what was read, so an administrator sees their own change straight away. */
  forget() {
    this.cache = null;
  }

  /** The ids a viewer may see and connect. */
  async allowedFor(viewer: { administrator: boolean }): Promise<string[]> {
    const availability = await this.all();
    return this.deps.catalog.connectors().filter((c) => visibleTo(availability[c.id] ?? DEFAULT_AVAILABILITY, viewer)).map((c) => c.id);
  }

  private async compute(): Promise<Record<string, Availability>> {
    const chosen = await this.deps.policies.all();
    const statuses = this.statuses();
    const out: Record<string, Availability> = {};
    for (const connector of this.deps.catalog.connectors()) {
      out[connector.id] = effectiveAvailability(statuses[connector.id], chosen[connector.id]?.availability);
    }
    return out;
  }
}

/** Whether this user counts as an administrator, for surfaces that gate on it. */
export function administrates(user: User | null, administrators: readonly string[]): boolean {
  return Boolean(user) && isAdministrator(user!, administrators);
}

export interface ConnectorControl {
  id: string;
  name: string;
  tier: Tier;
  /** Owners sign in or paste a key for it. Connectors without it need no account. */
  needsAccount: boolean;
  status: ServerStatus | null;
  /** What an administrator asked for, before the server has its say. */
  chosen: Availability;
  effective: Availability;
  /** Why `effective` differs from `chosen`, if it does. */
  override: PolicyOverride;
  connections: number;
  changedBy: string | null;
  changedAt: number | null;
}

interface AdminDeps {
  users: UserRepository;
  connections: ConnectionRepository;
  policies: ConnectorPolicies;
  access: ConnectorAccess;
  catalog: BrowsableCatalog;
  clock: Clock;
  administrators: readonly string[];
}

/** The administrator behind a request, or a not-found: the back office doesn't admit it exists to anyone else. */
async function administrator(deps: Pick<AdminDeps, "users" | "administrators">, userId: string | null): Promise<User> {
  const user = userId ? await deps.users.byId(userId) : null;
  if (!user || !isAdministrator(user, deps.administrators)) throw notFound("This page");
  return user;
}

/** The connectors a visitor may see listed: marketing pages never show what only administrators can use. */
export class ListPublicConnectors {
  constructor(private readonly deps: { access: ConnectorAccess }) {}

  execute(): Promise<string[]> {
    return this.deps.access.allowedFor({ administrator: false });
  }
}

/** Every connector, what its keys point at, and who may use it. */
export class GetConnectorControls {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null }): Promise<ConnectorControl[]> {
    await administrator(this.deps, input.userId);
    const [chosen, connections] = await Promise.all([this.deps.policies.all(), this.deps.connections.list(CONNECTION_COUNT_LIMIT)]);
    const statuses = this.deps.access.statuses();
    const counts = new Map<string, number>();
    for (const c of connections) counts.set(c.connector, (counts.get(c.connector) ?? 0) + 1);

    return this.deps.catalog
      .connectors()
      .map((connector) => {
        const status = statuses[connector.id] ?? null;
        const chosenFor = chosen[connector.id];
        return {
          id: connector.id,
          name: connector.name,
          tier: connector.tier,
          needsAccount: Boolean(connector.auth),
          status,
          chosen: chosenFor?.availability ?? DEFAULT_AVAILABILITY,
          effective: effectiveAvailability(status, chosenFor?.availability),
          override: overrideOf(status),
          connections: counts.get(connector.id) ?? 0,
          changedBy: chosenFor?.by ?? null,
          changedAt: chosenFor?.at ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** Opens a connector to everyone, keeps it to administrators, or takes it off. */
export class SetConnectorAvailability {
  constructor(private readonly deps: AdminDeps) {}

  async execute(input: { userId: string | null; connectorId: string; availability: unknown }): Promise<{ id: string; chosen: Availability; effective: Availability }> {
    const admin = await administrator(this.deps, input.userId);
    const connector = this.deps.catalog.connector(input.connectorId);
    if (!connector) throw notFound(`Connector "${input.connectorId}"`);
    if (!isAvailability(input.availability)) throw invalid("Pick who may use this connector: everyone, administrators, or nobody.");

    const status = this.deps.access.statuses()[connector.id] ?? null;
    const override = overrideOf(status);
    if (input.availability === "everyone" && override) {
      throw invalid(
        override === "unconfigured"
          ? `${connector.name} has no server credentials on this Flexwall, so nobody can use it yet.`
          : `${connector.name} still points at its provider's sandbox: test data stays with administrators.`
      );
    }

    const policy: ConnectorPolicy = { availability: input.availability, by: admin.email, at: this.deps.clock.now() };
    await this.deps.policies.save(connector.id, policy);
    this.deps.access.forget();
    return { id: connector.id, chosen: policy.availability, effective: effectiveAvailability(status, policy.availability) };
  }
}
