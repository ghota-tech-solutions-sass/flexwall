import type { ConnectorDef } from "@flexwall/sdk";
import type { TileRef } from "@/application/editor/draft";
import type { ConnectionView, CredentialsState } from "@/domain/connection";

/**
 * How account lists word what they show: usage, credentials, groups and the
 * connector search. Pure, so settings and the editor say the same thing.
 */

const tiles = (n: number) => `${n} ${n === 1 ? "tile" : "tiles"}`;

/** "Used by 2 tiles", or that no tile uses it yet. */
export function usageLine(used: readonly TileRef[]): string {
  return used.length ? `Used by ${tiles(used.length)}` : "Not used by any tile";
}

/** What removing an account does to the wall, said before it happens. */
export function removalWarning(used: readonly TileRef[]): string {
  if (!used.length) return "No tile uses this account.";
  return `${tiles(used.length)} will wait for another account.`;
}

export type Tone = "ok" | "warn" | "error";

/** Whether the owner has something to do about an account's credentials. */
export function credentialsLine(state: CredentialsState, formatDate: (epochMs: number) => string): { tone: Tone; text: string; reconnect: boolean } | null {
  if (!state) return null;
  switch (state.kind) {
    case "renews":
      return { tone: "ok", text: "Renews automatically", reconnect: false };
    case "expires":
      return { tone: "warn", text: `Reconnect before ${formatDate(state.at)}`, reconnect: true };
    case "expired":
      return { tone: "error", text: "Expired — reconnect", reconnect: true };
  }
}

export interface ConnectorGroup {
  connector: string;
  name: string;
  connections: ConnectionView[];
}

/** Accounts by provider, providers by name, accounts in the order they were connected. */
export function groupByConnector(views: readonly ConnectionView[], connectorName: (id: string) => string | undefined): ConnectorGroup[] {
  const groups = new Map<string, ConnectorGroup>();
  for (const view of views) {
    const group = groups.get(view.connector) ?? { connector: view.connector, name: connectorName(view.connector) ?? view.connector, connections: [] };
    group.connections.push(view);
    groups.set(view.connector, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, connections: [...g.connections].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Connectors that take an account, matching what the owner typed in their name or description, by name. */
/** Only the connectors this viewer may use: the rest are paused or kept to administrators. */
export function visibleConnectors(connectors: readonly ConnectorDef[], allowed: readonly string[]): ConnectorDef[] {
  const open = new Set(allowed);
  return connectors.filter((c) => open.has(c.id));
}

export function searchConnectors(connectors: readonly ConnectorDef[], query: string): ConnectorDef[] {
  const q = query.trim().toLowerCase();
  return connectors
    .filter((c) => c.auth && (!q || `${c.name} ${c.id} ${c.description}`.toLowerCase().includes(q)))
    .sort((a, b) => {
      // A name that starts with the query beats a description that mentions it.
      const rank = (c: ConnectorDef) => (q && c.name.toLowerCase().startsWith(q) ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
}
