import Stripe from "stripe";
import type { BillingEvent, BillingPlan, PaymentGateway } from "@/application/ports";
import type { Subscription, SubscriptionStatus, User } from "@/domain/user";

export interface StripePrices {
  monthly: string | null;
  yearly: string | null;
  lifetime: string | null;
}

/** Inline prices used when no Stripe price ids are configured (test mode, self-hosting). */
const FALLBACK = {
  monthly: { unit_amount: 600, recurring: { interval: "month" as const } },
  yearly: { unit_amount: 4800, recurring: { interval: "year" as const } },
  lifetime: { unit_amount: 9900 },
};

/**
 * Flexwall's own billing (not the Stripe connector): hosted Checkout for the
 * subscription and the lifetime plan, the customer portal, and webhook events
 * translated into domain `BillingEvent`s. The user id travels in metadata on
 * both the session and the subscription, so events can be matched even before
 * the customer id is stored.
 */
export class StripeGateway implements PaymentGateway {
  private client: Stripe | null = null;

  constructor(
    private readonly config: { secretKey: string | undefined; webhookSecret: string | undefined; prices: StripePrices }
  ) {}

  enabled() {
    return Boolean(this.config.secretKey);
  }

  private stripe(): Stripe {
    if (!this.config.secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
    return (this.client ??= new Stripe(this.config.secretKey, { maxNetworkRetries: 2 }));
  }

  private async customerFor(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.stripe().customers.create({ email: user.email, metadata: { userId: user.id, handle: user.handle ?? "" } });
    return customer.id;
  }

  async checkoutUrl(input: { user: User; plan: BillingPlan; successUrl: string; cancelUrl: string }) {
    const customerId = await this.customerFor(input.user);
    const priceId = this.config.prices[input.plan];
    const metadata = { userId: input.user.id, plan: input.plan };
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: { name: input.plan === "lifetime" ? "Flexwall Lifetime" : "Flexwall Pro" },
            ...FALLBACK[input.plan],
          },
        };
    const session = await this.stripe().checkout.sessions.create({
      customer: customerId,
      mode: input.plan === "lifetime" ? "payment" : "subscription",
      line_items: [lineItem],
      allow_promotion_codes: true,
      metadata,
      ...(input.plan === "lifetime" ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
    return { url: session.url, customerId };
  }

  async portalUrl(input: { customerId: string; returnUrl: string }) {
    const portal = await this.stripe().billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return portal.url;
  }

  async parseEvent(rawBody: string, signature: string): Promise<BillingEvent | null> {
    if (!this.config.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    // Async verification: under Bun, Stripe uses WebCrypto, which has no synchronous HMAC.
    const event = await this.stripe().webhooks.constructEventAsync(rawBody, signature, this.config.webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "payment" || session.metadata?.plan !== "lifetime") return null;
        if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!customerId || !session.metadata?.userId) return null;
        return { id: event.id, type: "lifetime", customerId, userId: session.metadata.userId };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        return {
          id: event.id,
          type: "subscription",
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          userId: sub.metadata?.userId ?? null,
          subscription: toSubscription(sub),
        };
      }
      default:
        return null;
    }
  }
}

export function toSubscription(sub: Stripe.Subscription): Subscription {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    status: sub.status as SubscriptionStatus,
    interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    currentPeriodEnd: (item?.current_period_end ?? 0) * 1000,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
