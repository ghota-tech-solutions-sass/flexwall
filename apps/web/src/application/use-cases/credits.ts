import type { Catalog } from "@/domain/catalog";
import { daysLeft, type CreditEntry } from "@/domain/credits";
import type { ConnectionRepository, CreditAccounts } from "../ports";

/** Entries settings shows under the balance. */
export const CREDIT_HISTORY_SHOWN = 8;

export interface CreditsView {
  balance: number;
  /** Credits a day if every metered connection refreshes every day. */
  perDay: number;
  /** Whole days the balance lasts at that pace; null when nothing spends credits. */
  daysLeft: number | null;
  /** The connections that spend credits, by label. */
  metered: { id: string; label: string; creditsPerDay: number }[];
  recent: CreditEntry[];
}

/** An owner's credits: what's left, what spends them, and how long they last. */
export class GetCredits {
  constructor(private readonly deps: { credits: CreditAccounts; connections: ConnectionRepository; catalog: Catalog }) {}

  async execute(input: { userId: string }): Promise<CreditsView> {
    const [balance, connections, recent] = await Promise.all([
      this.deps.credits.balance(input.userId),
      this.deps.connections.byOwner(input.userId),
      this.deps.credits.history(input.userId, CREDIT_HISTORY_SHOWN),
    ]);
    const metered = connections
      .map((c) => ({ id: c.id, label: c.label, creditsPerDay: this.deps.catalog.connector(c.connector)?.creditsPerDay ?? 0 }))
      .filter((c) => c.creditsPerDay > 0);
    const perDay = metered.reduce((sum, c) => sum + c.creditsPerDay, 0);
    return { balance, perDay, daysLeft: daysLeft(balance, perDay), metered, recent };
  }
}
