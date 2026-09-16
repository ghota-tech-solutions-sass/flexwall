import { ConnectorError, defaultCacheKey, ExpiredCredentialsError, isValue, series, type ConnectorDef, type FieldValues, type InputValue, type Surface, type Value } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import { needsRenewal, type Connection } from "@/domain/connection";
import { DEFAULT_AVAILABILITY, visibleTo, type Availability } from "@/domain/connector-policy";
import { creditDay } from "@/domain/credits";
import { entitlementsOf, type Entitlements, type User } from "@/domain/user";
import { shiftDay, todayIn } from "@/domain/time";
import { HISTORY_DAYS, type Binding, type Tile } from "@/domain/wall";
import type { CachedValues, Clock, ConnectionRepository, ConnectorAvailability, ConnectorRuntime, CreditAccounts, SecretBox, SnapshotStore, ValueCache } from "../ports";
import { administrates } from "./connector-policy";

/** What a tile can draw: its inputs, or the reason it can't yet. */
export type TileState =
  | { status: "ready"; inputs: Record<string, InputValue> }
  | { status: "placeholder"; reason: "connect" | "pro" | "unavailable"; message: string };

export interface ResolveRequest {
  tiles: readonly Tile[];
  owner: User;
  surface: Surface;
  /** Never call upstreams: use whatever is cached. For listings. */
  cacheOnly?: boolean;
}

export interface Resolution {
  states: Record<string, TileState>;
  today: string;
  entitlements: Entitlements;
}

/** How long a render waits for an upstream before using the last known value. */
export const RENDER_DEADLINE_MS = 4000;
/** Editor previews keep values in memory this long, so dragging tiles doesn't refetch. */
const MEMORY_TTL_FLOOR_MS = 60_000;

type Placeholder = Extract<TileState, { status: "placeholder" }>;

interface Group {
  key: string;
  connector: ConnectorDef;
  params: FieldValues;
  connection: Connection | null;
  metrics: Set<string>;
}

class Deadline extends Error {}

/** What an owner reads when a metered connector can't refresh for lack of credits. */
export function outOfCreditsMessage(connectorName: string): string {
  return `Out of credits: ${connectorName} tiles refresh again once you add credits in settings.`;
}

/** How long a group's values stay fresh: the connector's ttl, or longer when the connection asks for it (an owner paying per call). */
export function freshnessSeconds(connector: ConnectorDef, connection: Connection | null): number {
  const own = connection && connector.ttlFor ? connector.ttlFor(connection.public) : connector.ttl;
  return Number.isFinite(own) ? Math.max(connector.ttl, own) : connector.ttl;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Deadline(`no answer within ${ms}ms`)), ms);
    }),
  ]);
}

function stableParams(params: FieldValues): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
}

/** Identifies one number over time, for daily snapshots. */
export function seriesKey(binding: Extract<Binding, { kind: "metric" }>): string {
  return `${binding.connector}|${binding.connection ?? "-"}|${binding.metric}|${stableParams(binding.params)}`;
}

/**
 * Turns tiles into what widgets draw. The rules, in order:
 *  1. Static bindings are ready as they are.
 *  2. Pro connectors and history need a paid owner, except in the owner's editor.
 *  3. Connectors with auth need one of the owner's connections.
 *  4. Bindings are grouped by connector, connection and cache key, so one upstream
 *     call answers every tile that can share it.
 *  5. Fresh cache wins. Otherwise one fetch per group (single flight), at most
 *     RENDER_DEADLINE_MS, falling back to the last known values marked stale.
 *  6. Connectors read with a paid server key spend the owner's credits, once per
 *     connection per UTC day, just before the upstream call; a call that fails
 *     gives the credit back. Without credits, the last values stay, marked stale.
 *  7. Surfaces other than the editor persist what they fetch and record today's
 *     snapshot of every number, which is what history is made of.
 */
export class ResolveWall {
  private readonly memory = new Map<string, CachedValues>();
  private readonly flights = new Map<string, Promise<CachedValues>>();
  /** One renewal per connection at a time: providers that rotate refresh tokens accept each one once. */
  private readonly renewals = new Map<string, Promise<{ connection: Connection; secret: Record<string, string> }>>();
  private readonly recorded = new Set<string>();

  constructor(
    private readonly deps: {
      catalog: Catalog;
      connections: ConnectionRepository;
      cache: ValueCache;
      snapshots: SnapshotStore;
      secrets: SecretBox;
      runtime: ConnectorRuntime;
      credits: CreditAccounts;
      access: ConnectorAvailability;
      administrators: readonly string[];
      clock: Clock;
    }
  ) {}

  async execute(req: ResolveRequest): Promise<Resolution> {
    const now = this.deps.clock.now();
    const today = todayIn(req.owner.timeZone, now);
    const entitlements = entitlementsOf(req.owner, now);
    const editor = req.surface === "editor";
    const connections = new Map((await this.deps.connections.byOwner(req.owner.id)).map((c) => [c.id, c]));
    // Read once per render, not once per tile: connectors paused or kept to administrators stop rendering for everyone else.
    const availability = await this.deps.access.all();
    const owner = { administrator: administrates(req.owner, this.deps.administrators) };

    const blocked = new Map<string, Placeholder>();
    const groups = new Map<string, Group>();
    const groupOf = new Map<Binding, string>();

    for (const tile of req.tiles) {
      for (const binding of Object.values(tile.inputs)) {
        if (binding.kind !== "metric") continue;
        const connector = this.deps.catalog.connector(binding.connector);
        const problem = this.gate(binding, connector, entitlements, editor, connections, { availability, owner });
        if (problem) {
          if (!blocked.has(tile.id)) blocked.set(tile.id, problem);
          continue;
        }
        const connection = binding.connection ? connections.get(binding.connection)! : null;
        const cacheKey = (connector!.cacheKey ?? defaultCacheKey)({ metric: binding.metric, params: binding.params });
        const key = `${connector!.id}|${connection?.id ?? "-"}|${cacheKey}`;
        const group = groups.get(key) ?? { key, connector: connector!, params: binding.params, connection, metrics: new Set<string>() };
        group.metrics.add(binding.metric);
        groups.set(key, group);
        groupOf.set(binding, key);
      }
    }

    const results = new Map<string, { entry: CachedValues | null; stale: boolean; error: string | null }>();
    await Promise.all(
      [...groups.values()].map(async (group) => {
        results.set(group.key, await this.load(group, { today, now, persist: !editor, cacheOnly: Boolean(req.cacheOnly) }));
      })
    );

    const states: Record<string, TileState> = {};
    for (const tile of req.tiles) {
      if (blocked.has(tile.id)) {
        states[tile.id] = blocked.get(tile.id)!;
        continue;
      }
      states[tile.id] = await this.tileState(tile, groupOf, results, { today, editor, record: !editor });
    }
    return { states, today, entitlements };
  }

  private gate(
    binding: Extract<Binding, { kind: "metric" }>,
    connector: ConnectorDef | null,
    entitlements: Entitlements,
    editor: boolean,
    connections: Map<string, Connection>,
    policy: { availability: Record<string, Availability>; owner: { administrator: boolean } }
  ): Placeholder | null {
    if (!connector || !this.deps.catalog.metric(binding.connector, binding.metric)) {
      return { status: "placeholder", reason: "unavailable", message: "This data source was removed." };
    }
    if (!visibleTo(policy.availability[connector.id] ?? DEFAULT_AVAILABILITY, policy.owner)) {
      return { status: "placeholder", reason: "unavailable", message: `${connector.name} is paused on Flexwall.` };
    }
    if (!editor && connector.tier === "pro" && !entitlements.proConnectors) {
      return { status: "placeholder", reason: "pro", message: `${connector.name} tiles show with Pro.` };
    }
    if (!editor && binding.history && !entitlements.history) {
      return { status: "placeholder", reason: "pro", message: "History shows with Pro." };
    }
    if (connector.auth) {
      const connection = binding.connection ? connections.get(binding.connection) : undefined;
      if (!connection || connection.connector !== connector.id) {
        return { status: "placeholder", reason: "connect", message: `Connect ${connector.name}` };
      }
    }
    return null;
  }

  private async load(
    group: Group,
    opts: { today: string; now: number; persist: boolean; cacheOnly: boolean }
  ): Promise<{ entry: CachedValues | null; stale: boolean; error: string | null }> {
    const ttlMs = freshnessSeconds(group.connector, group.connection) * 1000;
    const known = [this.memory.get(group.key), await this.deps.cache.get(group.key)]
      .filter((e): e is CachedValues => Boolean(e))
      .sort((a, b) => b.at - a.at)[0];
    const covers = (e: CachedValues) => [...group.metrics].every((m) => m in e.values);
    if (known && covers(known) && (opts.cacheOnly || opts.now - known.at < Math.max(ttlMs, MEMORY_TTL_FLOOR_MS))) {
      return { entry: known, stale: false, error: null };
    }
    if (opts.cacheOnly) return { entry: known ?? null, stale: Boolean(known), error: known ? null : "Not loaded yet." };

    let flight = this.flights.get(group.key);
    if (!flight) {
      flight = this.fetchGroup(group, opts.today)
        .then(async (entry) => {
          this.memory.set(group.key, entry);
          if (opts.persist) await this.deps.cache.set(group.key, entry).catch(() => undefined);
          return entry;
        })
        .finally(() => this.flights.delete(group.key));
      this.flights.set(group.key, flight);
      // A flight can outlive the render that started it; its outcome still fills the cache.
      flight.catch(() => undefined);
    }

    try {
      return { entry: await withDeadline(flight, RENDER_DEADLINE_MS), stale: false, error: null };
    } catch (error) {
      const message = error instanceof ConnectorError ? error.message : error instanceof Deadline ? `${group.connector.name} is slow to answer.` : `${group.connector.name} is unreachable.`;
      return known ? { entry: known, stale: true, error: null } : { entry: null, stale: false, error: message };
    }
  }

  private async fetchGroup(group: Group, today: string): Promise<CachedValues> {
    let connection = group.connection;
    let secret: Record<string, string> | null = null;
    if (connection) {
      try {
        secret = this.deps.secrets.open(connection.sealed);
      } catch {
        throw new ConnectorError(`Reconnect ${group.connector.name}: its credentials can't be read anymore.`);
      }
      if (needsRenewal(connection, this.deps.clock.now())) ({ connection, secret } = await this.renew(group.connector, connection, secret, today));
    }
    const charge = await this.charge(group.connector, connection);
    const run = () =>
      group.connector.fetch({ metrics: [...group.metrics], params: group.params, secret, public: connection?.public ?? null }, this.deps.runtime.context(today));
    let values;
    try {
      try {
        values = await run();
      } catch (error) {
        // The provider says the token lapsed before we thought: renew once and try again.
        if (!(error instanceof ExpiredCredentialsError) || !connection || !secret) throw error;
        ({ connection, secret } = await this.renew(group.connector, connection, secret, today));
        values = await run();
      }
    } catch (error) {
      // A read that didn't happen isn't paid for.
      if (charge) await this.deps.credits.release(charge).catch(() => undefined);
      throw error;
    }
    const clean: Record<string, Value | null> = {};
    for (const m of group.metrics) {
      const v = values[m];
      clean[m] = v && isValue(v) ? v : null;
    }
    // Keep extra metrics the same call answered: other tiles may want them next.
    for (const [m, v] of Object.entries(values)) if (!(m in clean)) clean[m] = v && isValue(v) ? v : null;
    return { at: this.deps.clock.now(), values: clean };
  }

  private async tileState(
    tile: Tile,
    groupOf: Map<Binding, string>,
    results: Map<string, { entry: CachedValues | null; stale: boolean; error: string | null }>,
    opts: { today: string; editor: boolean; record: boolean }
  ): Promise<TileState> {
    const inputs: Record<string, InputValue> = {};
    for (const [key, binding] of Object.entries(tile.inputs)) {
      if (binding.kind === "static") {
        inputs[key] = { value: binding.value, stale: false };
        continue;
      }
      const connector = this.deps.catalog.connector(binding.connector)!;
      const result = results.get(groupOf.get(binding)!)!;
      if (!result.entry) {
        return { status: "placeholder", reason: "unavailable", message: opts.editor ? result.error ?? "No data yet." : "Temporarily unavailable" };
      }
      const value = result.entry.values[binding.metric] ?? null;
      if (!value) return { status: "placeholder", reason: "unavailable", message: "No data yet." };

      const sensitive = Boolean(this.deps.catalog.metric(connector.id, binding.metric)?.sensitive);
      const source = { connector: connector.id, name: connector.name, verified: connector.verified, sensitive };
      if (value.type === "number" && opts.record && !result.stale) await this.recordOnce(seriesKey(binding), opts.today, value.value);

      if (binding.history && value.type === "number") {
        const days = HISTORY_DAYS[binding.history];
        const points = await this.deps.snapshots.range(seriesKey(binding), shiftDay(opts.today, -(days - 1)), opts.today);
        const withToday = points.filter((p) => p.t !== opts.today).concat({ t: opts.today, v: value.value });
        inputs[key] = { value: series(withToday, { unit: value.unit, currency: value.currency }), stale: result.stale, source };
      } else {
        inputs[key] = { value, stale: result.stale, source };
      }
    }
    return { status: "ready", inputs };
  }

  /** Spends the day's credits of a metered connection. Returns what to give back if the read fails, or null when nothing was spent now. */
  private async charge(connector: ConnectorDef, connection: Connection | null): Promise<{ userId: string; key: string; day: string } | null> {
    const amount = connector.creditsPerDay;
    if (!amount || !connection) return null;
    const spend = { userId: connection.ownerId, key: connection.id, day: creditDay(this.deps.clock.now()) };
    const outcome = await this.deps.credits.spend({ ...spend, amount, detail: connection.label });
    if (outcome === "insufficient") throw new ConnectorError(outOfCreditsMessage(connector.name));
    return outcome === "charged" ? spend : null;
  }

  /**
   * Trades a connection's credentials for fresh ones and saves them sealed.
   * Without a way to renew, the owner has to sign in again.
   */
  private renew(connector: ConnectorDef, connection: Connection, secret: Record<string, string>, today: string) {
    let renewal = this.renewals.get(connection.id);
    if (!renewal) {
      renewal = (async () => {
        const refresh = connector.auth?.oauth?.refresh;
        if (!refresh) throw new ConnectorError(`Reconnect ${connector.name}: its sign-in expired.`);
        const renewed = await refresh({ secret, public: connection.public }, this.deps.runtime.context(today));
        const next: Connection = {
          ...connection,
          sealed: this.deps.secrets.seal(renewed.secret),
          public: renewed.public ?? connection.public,
          expiresAt: renewed.expiresAt ?? null,
        };
        await this.deps.connections.save(next);
        return { connection: next, secret: renewed.secret };
      })().finally(() => this.renewals.delete(connection.id));
      this.renewals.set(connection.id, renewal);
    }
    return renewal;
  }

  /** At most one write an hour per series: the day's point ends up as its latest reading. */
  private async recordOnce(key: string, day: string, value: number) {
    const id = `${key}@${day}@${new Date(this.deps.clock.now()).getUTCHours()}`;
    if (this.recorded.has(id)) return;
    this.recorded.add(id);
    await this.deps.snapshots.record(key, day, value).catch(() => this.recorded.delete(id));
  }
}
