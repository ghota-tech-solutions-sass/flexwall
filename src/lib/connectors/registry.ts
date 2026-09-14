import type { ConnectorId } from "@/lib/connectors/catalog";
import { github } from "@/lib/connectors/github";
import { http } from "@/lib/connectors/http";
import { stripe } from "@/lib/connectors/stripe";
import type { Connector } from "@/lib/connectors/types";

/** Every connector the server can run. The Record type makes a catalog entry without an implementation a compile error. */
export const CONNECTORS: Record<ConnectorId, Connector> = { github, stripe, http };

export function getConnector(id: string): Connector | null {
  return (CONNECTORS as Record<string, Connector>)[id] ?? null;
}
