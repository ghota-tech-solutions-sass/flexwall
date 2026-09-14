import { DomainError } from "@/domain/errors";
import { planOf } from "@/domain/user";
import type { BillingEvent, BillingPlan, Clock, EventLog, PaymentGateway, UserRepository } from "../ports";

export class StartCheckout {
  constructor(
    private readonly deps: { users: UserRepository; payments: PaymentGateway; clock: Clock; appUrl: string }
  ) {}

  async execute(input: { userId: string; plan: BillingPlan }): Promise<{ url: string }> {
    if (!this.deps.payments.enabled()) throw new DomainError("payments_unavailable", "Payments aren't switched on yet.");
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    const plan = planOf(user, this.deps.clock.now());
    if (plan === "lifetime") throw new DomainError("invalid_input", "You already have Flexwall for life.");
    if (plan === "pro" && input.plan !== "lifetime") throw new DomainError("invalid_input", "You're already Pro. Manage your plan from billing.");

    const { url, customerId } = await this.deps.payments.checkoutUrl({
      user,
      plan: input.plan,
      successUrl: `${this.deps.appUrl}/settings?upgraded=1`,
      cancelUrl: `${this.deps.appUrl}/pricing`,
    });
    if (customerId !== user.stripeCustomerId) await this.deps.users.save({ ...user, stripeCustomerId: customerId });
    return { url };
  }
}

export class OpenBillingPortal {
  constructor(private readonly deps: { users: UserRepository; payments: PaymentGateway; appUrl: string }) {}

  async execute(input: { userId: string }): Promise<{ url: string }> {
    const user = await this.deps.users.byId(input.userId);
    if (!user?.stripeCustomerId) throw new DomainError("invalid_input", "There's no billing history on this account yet.");
    return { url: await this.deps.payments.portalUrl({ customerId: user.stripeCustomerId, returnUrl: `${this.deps.appUrl}/settings` }) };
  }
}

/**
 * Keeps a user's plan in step with the payment provider. Idempotent per event:
 * providers retry, and a replay must not undo a newer state.
 */
export class ApplyBillingEvent {
  constructor(private readonly deps: { users: UserRepository; events: EventLog }) {}

  async execute(event: BillingEvent): Promise<"applied" | "duplicate" | "unknown_user"> {
    const user = (event.userId ? await this.deps.users.byId(event.userId) : null) ?? (await this.deps.users.byStripeCustomer(event.customerId));
    if (!user) return "unknown_user";
    if (!(await this.deps.events.firstTime(event.id))) return "duplicate";

    if (event.type === "lifetime") {
      await this.deps.users.save({ ...user, lifetime: true, stripeCustomerId: event.customerId });
      return "applied";
    }
    // Subscription events can arrive out of order; the one describing the same subscription wins by its period end.
    const current = user.subscription;
    if (current && current.id === event.subscription.id && current.currentPeriodEnd > event.subscription.currentPeriodEnd) return "applied";
    await this.deps.users.save({ ...user, subscription: event.subscription, stripeCustomerId: event.customerId });
    return "applied";
  }
}
