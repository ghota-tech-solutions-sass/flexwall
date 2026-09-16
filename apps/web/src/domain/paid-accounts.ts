import type { ConnectorDef } from "@flexwall/sdk";
import type { Catalog } from "./catalog";
import type { Connection } from "./connection";
import { MAX_PAID_ACCOUNTS } from "./pricing";
import { PAST_DUE_GRACE_MS, type Subscription, type User } from "./user";

/**
 * Some connectors cost Flexwall a fee at the provider every month, for as long
 * as an account stays connected: a bank through Plaid, Powens or Enable
 * Banking, a brokerage through SnapTrade. The owner pays for those by the
 * account, on a monthly subscription whose quantity follows what they have
 * connected.
 *
 * Two numbers matter: the *allowance* (accounts paid for) and the *usage*
 * (accounts connected). Connecting reads the allowance and never calls the
 * payment provider, so paying always comes first and a failed payment can
 * never leave an account connected for free.
 */

export function isPaidAccountConnector(connector: Pick<ConnectorDef, "serverCost"> | null | undefined): boolean {
  return connector?.serverCost === "per-account";
}

/** Connections that cost a monthly fee, oldest first: the order seats are kept in when the allowance drops. */
export function paidAccountsOf(connections: readonly Connection[], catalog: Catalog): Connection[] {
  return connections.filter((c) => isPaidAccountConnector(catalog.connector(c.connector))).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function countPaidAccounts(connections: readonly Connection[], catalog: Catalog): number {
  return paidAccountsOf(connections, catalog).length;
}

/** Whether a subscription is paying right now, with the same grace as Pro after a failed payment. */
function inForce(subscription: Subscription | null | undefined, now: number): number {
  if (!subscription) return 0;
  const { status, quantity, currentPeriodEnd } = subscription;
  if (status === "active" || status === "trialing") return quantity;
  if (status === "past_due" && now < currentPeriodEnd + PAST_DUE_GRACE_MS) return quantity;
  return 0;
}

/** Accounts this owner may keep connected: what they pay for, or what an administrator gave them. */
export function allowanceOf(user: Pick<User, "paidAccounts"> & { paidAccountsGranted?: number | null }, now: number): number {
  const paid = inForce(user.paidAccounts, now);
  return Math.min(MAX_PAID_ACCOUNTS, Math.max(paid, user.paidAccountsGranted ?? 0));
}

/**
 * The connections the allowance covers. When it drops below what's connected,
 * the oldest accounts keep their place: nothing is deleted, and which tiles go
 * quiet doesn't depend on the order a render happened to read them in.
 */
export function coveredConnectionIds(connections: readonly Connection[], catalog: Catalog, allowance: number): Set<string> {
  return new Set(paidAccountsOf(connections, catalog).slice(0, Math.max(0, allowance)).map((c) => c.id));
}
