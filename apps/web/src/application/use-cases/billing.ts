import { CREDIT_PACK_DETAILS, type CreditPack } from "@/domain/credits";
import { DomainError } from "@/domain/errors";
import { TERMS_VERSION } from "@/domain/publisher";
import { convert, grantMonth, refundable, takeMonthBack } from "@/domain/referral";
import { paidPlanOf } from "@/domain/user";
import type { AppLinks, BillingEvent, BillingPlan, Clock, CreditAccounts, EventLog, PaymentGateway, ReferralRepository, UserRepository } from "../ports";

export class StartCheckout {
  constructor(
    private readonly deps: { users: UserRepository; referrals: ReferralRepository; payments: PaymentGateway; clock: Clock; links: AppLinks }
  ) {}

  async execute(input: { userId: string; plan: BillingPlan; acceptedTerms: boolean }): Promise<{ url: string }> {
    if (!this.deps.payments.enabled()) throw new DomainError("payments_unavailable", "Payments aren't switched on yet.");
    if (input.acceptedTerms !== true) throw new DomainError("invalid_input", "Accept the terms and ask for Pro to start now to continue.");
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    // Referral Pro time doesn't count here: someone on a free month can still subscribe.
    const plan = paidPlanOf(user, this.deps.clock.now());
    if (plan === "lifetime") throw new DomainError("invalid_input", "You already have Flexwall for life.");
    if (plan === "pro" && input.plan !== "lifetime") throw new DomainError("invalid_input", "You're already Pro. Manage your plan from billing.");

    const { url, customerId } = await this.deps.payments.checkoutUrl({
      user,
      plan: input.plan,
      consent: { termsVersion: TERMS_VERSION, acceptedAt: this.deps.clock.now() },
      referralDiscount: await this.inviteeDiscount(user.id, user.referredBy),
      successUrl: this.deps.links.checkoutSucceeded(),
      cancelUrl: this.deps.links.checkoutCancelled(),
    });
    if (customerId !== user.stripeCustomerId) await this.deps.users.save({ ...user, stripeCustomerId: customerId });
    return { url };
  }

  /** The invitee discount lasts until their first payment converts the referral. */
  private async inviteeDiscount(userId: string, referredBy: string | null | undefined): Promise<boolean> {
    if (!referredBy) return false;
    return (await this.deps.referrals.byReferee(userId))?.status === "signed_up";
  }
}

/** Opens the payment of a credit pack. Any account can buy credits, free or Pro. */
export class StartCreditsCheckout {
  constructor(private readonly deps: { users: UserRepository; payments: PaymentGateway; clock: Clock; links: AppLinks }) {}

  async execute(input: { userId: string; pack: CreditPack; acceptedTerms: boolean }): Promise<{ url: string }> {
    if (!this.deps.payments.enabled()) throw new DomainError("payments_unavailable", "Payments aren't switched on yet.");
    if (input.acceptedTerms !== true) throw new DomainError("invalid_input", "Accept the terms and ask for your credits to be delivered now to continue.");
    const user = await this.deps.users.byId(input.userId);
    if (!user) throw new DomainError("unauthenticated", "Sign in again.");
    const { url, customerId } = await this.deps.payments.creditsCheckoutUrl({
      user,
      pack: input.pack,
      consent: { termsVersion: TERMS_VERSION, acceptedAt: this.deps.clock.now() },
      successUrl: this.deps.links.creditsPurchased(),
      cancelUrl: this.deps.links.billingReturn(),
    });
    if (customerId !== user.stripeCustomerId) await this.deps.users.save({ ...user, stripeCustomerId: customerId });
    return { url };
  }
}

export class OpenBillingPortal {
  constructor(private readonly deps: { users: UserRepository; payments: PaymentGateway; links: AppLinks }) {}

  async execute(input: { userId: string }): Promise<{ url: string }> {
    const user = await this.deps.users.byId(input.userId);
    if (!user?.stripeCustomerId) throw new DomainError("invalid_input", "There's no billing history on this account yet.");
    return { url: await this.deps.payments.portalUrl({ customerId: user.stripeCustomerId, returnUrl: this.deps.links.billingReturn() }) };
  }
}

/**
 * Keeps a user's plan in step with the payment provider. Idempotent per event:
 * providers retry, and a replay must not undo a newer state. An invitee's first
 * payment earns their referrer a month; a refund soon after takes it back.
 */
export class ApplyBillingEvent {
  constructor(private readonly deps: { users: UserRepository; events: EventLog; referrals: ReferralRepository; credits: CreditAccounts; clock: Clock }) {}

  async execute(event: BillingEvent): Promise<"applied" | "duplicate" | "unknown_user"> {
    const user = ("userId" in event && event.userId ? await this.deps.users.byId(event.userId) : null) ?? (await this.deps.users.byStripeCustomer(event.customerId));
    if (!user) return "unknown_user";
    if (!(await this.deps.events.firstTime(event.id))) return "duplicate";

    if (event.type === "credits") {
      // Keyed by the event: a replay past the event log still adds the pack once.
      await this.deps.credits.adjust({ userId: user.id, entryId: event.id, amount: CREDIT_PACK_DETAILS[event.pack].credits, reason: "purchase", detail: event.pack });
      if (user.stripeCustomerId !== event.customerId) await this.deps.users.save({ ...user, stripeCustomerId: event.customerId });
      return "applied";
    }
    if (event.type === "refund") {
      await this.refund(user.id);
      return "applied";
    }
    if (event.type === "lifetime") {
      await this.deps.users.save({ ...user, lifetime: true, stripeCustomerId: event.customerId });
      await this.firstPayment(user.id);
      return "applied";
    }
    // Subscription events can arrive out of order; the one describing the same subscription wins by its period end.
    const current = user.subscription;
    if (current && current.id === event.subscription.id && current.currentPeriodEnd > event.subscription.currentPeriodEnd) return "applied";
    await this.deps.users.save({ ...user, subscription: event.subscription, stripeCustomerId: event.customerId });
    if (event.subscription.status === "active" || event.subscription.status === "trialing") await this.firstPayment(user.id);
    return "applied";
  }

  /** Converts the invitee's referral once; the status makes replays and later renewals no-ops. */
  private async firstPayment(refereeId: string) {
    const referral = await this.deps.referrals.byReferee(refereeId);
    if (referral?.status !== "signed_up") return;
    const now = this.deps.clock.now();
    const rewardedSoFar = (await this.deps.referrals.byReferrer(referral.referrerId)).filter((r) => r.rewarded).length;
    const converted = convert(referral, rewardedSoFar, now);
    await this.deps.referrals.save(converted);
    if (!converted.rewarded) return;
    const referrer = await this.deps.users.byId(referral.referrerId);
    if (referrer) await this.deps.users.save(grantMonth(referrer, now));
  }

  private async refund(refereeId: string) {
    const referral = await this.deps.referrals.byReferee(refereeId);
    const now = this.deps.clock.now();
    if (!referral || !refundable(referral, now)) return;
    await this.deps.referrals.save({ ...referral, status: "refunded", rewarded: false });
    if (!referral.rewarded) return;
    const referrer = await this.deps.users.byId(referral.referrerId);
    if (referrer) await this.deps.users.save(takeMonthBack(referrer, now));
  }
}
