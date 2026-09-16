import type { Catalog } from "@/domain/catalog";
import { DomainError } from "@/domain/errors";
import { allowanceOf, countPaidAccounts, paidAccountsOf } from "@/domain/paid-accounts";
import { MAX_PAID_ACCOUNTS, PAID_ACCOUNT_PRICE_USD } from "@/domain/pricing";
import { TERMS_VERSION } from "@/domain/publisher";
import { planOf, type Subscription, type User } from "@/domain/user";
import type { AppLinks, Clock, ConnectionRepository, PaymentGateway, UserRepository } from "../ports";

/**
 * Connected bank and brokerage accounts are paid for monthly, one at a time.
 * The rule everything else follows: pay first, connect second. Connecting only
 * ever reads the allowance, so a payment that fails can't leave an account
 * connected for free, and a Stripe outage can't stop someone disconnecting.
 */

interface PaidAccountDeps {
  users: UserRepository;
  connections: ConnectionRepository;
  catalog: Catalog;
  payments: PaymentGateway;
  clock: Clock;
  links: AppLinks;
  log?: (message: string) => void;
}

export interface PaidAccountsView {
  /** Accounts paid for (or given). */
  allowance: number;
  /** Accounts connected. */
  used: number;
  priceUsd: number;
  monthlyUsd: number;
  max: number;
  /** Epoch ms of the next renewal, when there's a subscription. */
  renewsAt: number | null;
  endsAtPeriodEnd: boolean;
  /** Stripe is retrying a failed payment. */
  behindOnPayment: boolean;
  accounts: { id: string; label: string; connector: string; covered: boolean }[];
  granted: number;
}

/** Whether paid accounts concern this owner at all: settings hides the section from everyone else. */
export function usesPaidAccounts(view: PaidAccountsView): boolean {
  return view.used > 0 || view.allowance > 0;
}

export class GetPaidAccounts {
  constructor(private readonly deps: PaidAccountDeps) {}

  async execute(input: { userId: string }): Promise<PaidAccountsView> {
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    const connections = await this.deps.connections.byOwner(user.id);
    const now = this.deps.clock.now();
    const allowance = allowanceOf(user, now);
    const paid = paidAccountsOf(connections, this.deps.catalog);
    // Only what the subscription carries is billed; accounts an administrator gave cost nothing.
    const billed = inForce(user.paidAccounts, now)?.quantity ?? 0;
    const covered = new Set(paid.slice(0, allowance).map((c) => c.id));
    const subscription = user.paidAccounts ?? null;

    return {
      allowance,
      used: paid.length,
      priceUsd: PAID_ACCOUNT_PRICE_USD,
      monthlyUsd: billed * PAID_ACCOUNT_PRICE_USD,
      max: MAX_PAID_ACCOUNTS,
      renewsAt: subscription?.currentPeriodEnd ?? null,
      endsAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      behindOnPayment: subscription?.status === "past_due",
      accounts: paid.map((c) => ({ id: c.id, label: c.nickname || c.label, connector: c.connector, covered: covered.has(c.id) })),
      granted: user.paidAccountsGranted ?? 0,
    };
  }
}

/**
 * Pays for one more account: a checkout the first time, a larger quantity
 * afterwards. What Stripe answers is written down straight away so the owner
 * can connect at once; the webhook confirms it a moment later.
 */
export class AddPaidAccount {
  constructor(private readonly deps: PaidAccountDeps) {}

  async execute(input: { userId: string; acceptedTerms: boolean }): Promise<{ mode: "checkout"; url: string } | { mode: "added"; allowance: number }> {
    if (!this.deps.payments.enabled()) throw new DomainError("payments_unavailable", "Payments aren't switched on yet.");
    if (input.acceptedTerms !== true) throw new DomainError("invalid_input", "Accept the terms and ask for the account to start now to continue.");
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    const now = this.deps.clock.now();
    if (planOf(user, now) === "free") {
      throw new DomainError("plan_limit", "Bank and brokerage tiles show on a Pro wall: go Pro first, then add the account.");
    }

    const used = countPaidAccounts(await this.deps.connections.byOwner(user.id), this.deps.catalog);
    const wanted = Math.max(used, allowanceOf(user, now)) + 1;
    if (wanted > MAX_PAID_ACCOUNTS) throw new DomainError("invalid_input", `Flexwall keeps ${MAX_PAID_ACCOUNTS} paid accounts at most.`);

    const running = inForce(user.paidAccounts, now);
    if (!running) {
      const { url, customerId } = await this.deps.payments.paidAccountsCheckoutUrl({
        user,
        quantity: wanted,
        consent: { termsVersion: TERMS_VERSION, acceptedAt: now },
        successUrl: this.deps.links.paidAccountAdded(),
        cancelUrl: this.deps.links.billingReturn(),
      });
      if (customerId !== user.stripeCustomerId) await this.deps.users.save({ ...user, stripeCustomerId: customerId });
      return { mode: "checkout", url };
    }

    const updated = await this.deps.payments.setPaidAccountsQuantity({ subscription: running, quantity: wanted, direction: "up" });
    await this.deps.users.save({ ...user, paidAccounts: { ...updated, updatedAt: now } });
    return { mode: "added", allowance: wanted };
  }
}

/**
 * Brings what Stripe bills back in line with what's connected, downwards only:
 * paying for more than one uses is the owner's money, so it is given back, but
 * nobody is ever charged for something they didn't ask for. Best effort — a
 * Stripe outage must never stop an owner removing an account.
 */
export class ReconcilePaidAccounts {
  constructor(private readonly deps: PaidAccountDeps) {}

  async execute(input: { userId: string }): Promise<void> {
    const user = await this.deps.users.byId(input.userId);
    if (!user || !this.deps.payments.enabled()) return;
    const now = this.deps.clock.now();
    const running = inForce(user.paidAccounts, now);
    if (!running) return;

    try {
      await this.keepOne(user, running);
      const used = countPaidAccounts(await this.deps.connections.byOwner(user.id), this.deps.catalog);
      if (used >= running.quantity) return;
      const updated = await this.deps.payments.setPaidAccountsQuantity({ subscription: running, quantity: used, direction: "down" });
      const saved = await this.deps.users.byId(user.id);
      if (saved) await this.deps.users.save({ ...saved, paidAccounts: { ...updated, updatedAt: now } });
    } catch (error) {
      this.deps.log?.(`paid accounts not reconciled for ${user.id}: ${(error as Error).message}`);
    }
  }

  /** Two checkouts can open two subscriptions; the oldest is kept and the rest cancelled, so nobody pays twice. */
  private async keepOne(user: User, running: Subscription): Promise<void> {
    if (!user.stripeCustomerId) return;
    const subscriptions = await this.deps.payments.paidAccountsSubscriptions(user.stripeCustomerId);
    for (const extra of subscriptions.filter((s) => s.id !== running.id)) await this.deps.payments.cancelSubscription(extra.id);
  }
}

/** The accounts subscription while it's paying, or null. */
function inForce(subscription: Subscription | null | undefined, now: number): Subscription | null {
  if (!subscription) return null;
  const paidFor = allowanceOf({ paidAccounts: subscription }, now);
  return paidFor > 0 || subscription.status === "active" || subscription.status === "trialing" ? subscription : null;
}
