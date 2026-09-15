import Stripe from "stripe";
import type { BillingEvent, BillingPlan, CheckoutConsent, PaymentGateway } from "@/application/ports";
import { CREDIT_PACK_DETAILS, isCreditPack, type CreditPack } from "@/domain/credits";
import type { Subscription, SubscriptionStatus, User } from "@/domain/user";

export interface StripePrices {
  monthly: string | null;
  yearly: string | null;
  lifetime: string | null;
  /** One-off prices of the credit packs. */
  credits?: Partial<Record<CreditPack, string | null>>;
}

/** Tells credit pack payments apart from plan payments in session metadata. */
export const CREDITS_METADATA_KIND = "credits";

/** Inline prices used when no Stripe price ids are configured (test mode, self-hosting). Taxes included, like the configured ones. */
const FALLBACK = {
  monthly: { unit_amount: 600, recurring: { interval: "month" as const } },
  yearly: { unit_amount: 4800, recurring: { interval: "year" as const } },
  lifetime: { unit_amount: 9900 },
};

export interface CheckoutOptions {
  /** Stripe Tax computes VAT from the buyer's address. Needs Stripe Tax active on the account, or session creation fails. */
  automaticTax: boolean;
  /** Stripe's own terms checkbox. Needs a terms URL in the account's public details, or session creation fails. */
  collectTermsConsent: boolean;
  /** The invitee coupon (20% off once). Without one, invitees pay full price. */
  referralCoupon: string | null;
}

/** The Checkout session for a plan, kept pure so what a buyer sees and agrees to is testable without Stripe. */
export function checkoutSessionParams(input: {
  customerId: string;
  userId: string;
  plan: BillingPlan;
  priceId: string | null;
  consent: CheckoutConsent;
  referralDiscount: boolean;
  successUrl: string;
  cancelUrl: string;
  options: CheckoutOptions;
}): Stripe.Checkout.SessionCreateParams {
  const lifetime = input.plan === "lifetime";
  const coupon = input.referralDiscount ? input.options.referralCoupon : null;
  // The consent recorded on our side travels with the payment: proof of the terms version and of the request to start right away.
  const metadata = {
    userId: input.userId,
    plan: input.plan,
    terms_version: input.consent.termsVersion,
    terms_accepted_at: new Date(input.consent.acceptedAt).toISOString(),
    immediate_start: "requested",
  };
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = input.priceId
    ? { price: input.priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: lifetime ? "Flexwall Lifetime" : "Flexwall Pro" },
          tax_behavior: "inclusive",
          ...FALLBACK[input.plan],
        },
      };
  return {
    customer: input.customerId,
    mode: lifetime ? "payment" : "subscription",
    line_items: [lineItem],
    // Stripe refuses promotion codes alongside a discount: an invitee gets theirs applied instead.
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    metadata,
    ...(lifetime ? { payment_intent_data: { metadata }, invoice_creation: { enabled: true } } : { subscription_data: { metadata } }),
    custom_text: {
      submit: {
        message: lifetime
          ? "Pro starts as soon as you pay, for good. Full refund on request within 14 days."
          : "Pro starts as soon as you pay and renews until you cancel. Full refund of the first payment on request within 14 days.",
      },
    },
    ...(input.options.automaticTax
      ? {
          automatic_tax: { enabled: true },
          billing_address_collection: "required" as const,
          customer_update: { address: "auto" as const, name: "auto" as const },
          tax_id_collection: { enabled: true },
        }
      : {}),
    ...(input.options.collectTermsConsent ? { consent_collection: { terms_of_service: "required" as const } } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

/** The Checkout session for a credit pack: a one-off payment, with the same consent and tax handling as plans. */
export function creditsSessionParams(input: {
  customerId: string;
  userId: string;
  pack: CreditPack;
  priceId: string | null;
  consent: CheckoutConsent;
  successUrl: string;
  cancelUrl: string;
  options: CheckoutOptions;
}): Stripe.Checkout.SessionCreateParams {
  const { credits, priceUsd } = CREDIT_PACK_DETAILS[input.pack];
  const metadata = {
    userId: input.userId,
    kind: CREDITS_METADATA_KIND,
    pack: input.pack,
    credits: String(credits),
    terms_version: input.consent.termsVersion,
    terms_accepted_at: new Date(input.consent.acceptedAt).toISOString(),
    immediate_start: "requested",
  };
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = input.priceId
    ? { price: input.priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: `${credits} Flexwall credits` },
          tax_behavior: "inclusive",
          unit_amount: Math.round(priceUsd * 100),
        },
      };
  return {
    customer: input.customerId,
    mode: "payment",
    line_items: [lineItem],
    metadata,
    payment_intent_data: { metadata },
    invoice_creation: { enabled: true },
    custom_text: {
      submit: { message: `${credits} credits land on your account as soon as you pay. Unused credits are refunded on request within 14 days.` },
    },
    ...(input.options.automaticTax
      ? {
          automatic_tax: { enabled: true },
          billing_address_collection: "required" as const,
          customer_update: { address: "auto" as const, name: "auto" as const },
          tax_id_collection: { enabled: true },
        }
      : {}),
    ...(input.options.collectTermsConsent ? { consent_collection: { terms_of_service: "required" as const } } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

/**
 * Flexwall's own billing (not the Stripe connector): hosted Checkout for the
 * subscription and the lifetime plan, the customer portal, and webhook events
 * translated into domain `BillingEvent`s. The user id travels in metadata on
 * both the session and the subscription, so events can be matched even before
 * the customer id is stored.
 */
/** The header Stripe signs webhook deliveries in. */
export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

export class StripeGateway implements PaymentGateway {
  private client: Stripe | null = null;

  constructor(
    private readonly config: {
      secretKey: string | undefined;
      webhookSecret: string | undefined;
      prices: StripePrices;
      /** A portal configuration id. Without one Stripe uses the account's default, which live mode may not have. */
      portalConfiguration?: string | null;
      checkout?: CheckoutOptions;
    }
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

  async checkoutUrl(input: { user: User; plan: BillingPlan; consent: CheckoutConsent; referralDiscount: boolean; successUrl: string; cancelUrl: string }) {
    const customerId = await this.customerFor(input.user);
    const session = await this.stripe().checkout.sessions.create(
      checkoutSessionParams({
        customerId,
        userId: input.user.id,
        plan: input.plan,
        priceId: this.config.prices[input.plan],
        consent: input.consent,
        referralDiscount: input.referralDiscount,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        options: this.config.checkout ?? { automaticTax: false, collectTermsConsent: false, referralCoupon: null },
      })
    );
    if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
    return { url: session.url, customerId };
  }

  async creditsCheckoutUrl(input: { user: User; pack: CreditPack; consent: CheckoutConsent; successUrl: string; cancelUrl: string }) {
    const customerId = await this.customerFor(input.user);
    const session = await this.stripe().checkout.sessions.create(
      creditsSessionParams({
        customerId,
        userId: input.user.id,
        pack: input.pack,
        priceId: this.config.prices.credits?.[input.pack] ?? null,
        consent: input.consent,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        options: this.config.checkout ?? { automaticTax: false, collectTermsConsent: false, referralCoupon: null },
      })
    );
    if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
    return { url: session.url, customerId };
  }

  async portalUrl(input: { customerId: string; returnUrl: string }) {
    const portal = await this.stripe().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      ...(this.config.portalConfiguration ? { configuration: this.config.portalConfiguration } : {}),
    });
    return portal.url;
  }

  async parseEvent(rawBody: string, signature: string): Promise<BillingEvent | null> {
    if (!this.config.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    // Async verification: under Bun, Stripe uses WebCrypto, which has no synchronous HMAC.
    const event = await this.stripe().webhooks.constructEventAsync(rawBody, signature, this.config.webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "payment") return null;
        if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const userId = session.metadata?.userId;
        if (!customerId || !userId) return null;
        if (session.metadata?.kind === CREDITS_METADATA_KIND) {
          const pack = session.metadata.pack;
          // The pack decides the amount, never a number carried in metadata.
          return isCreditPack(pack) ? { id: event.id, type: "credits", customerId, userId, pack, credits: CREDIT_PACK_DETAILS[pack].credits } : null;
        }
        if (session.metadata?.plan !== "lifetime") return null;
        return { id: event.id, type: "lifetime", customerId, userId };
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
        // Partial refunds keep the purchase, and the referral with it.
        if (!charge.refunded || !customerId) return null;
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (intentId) {
          // Pack payments carry their metadata on the payment intent, not on the charge.
          const metadata = charge.metadata?.kind ? charge.metadata : (await this.stripe().paymentIntents.retrieve(intentId)).metadata;
          if (metadata?.kind === CREDITS_METADATA_KIND) {
            return isCreditPack(metadata.pack) && metadata.userId ? { id: event.id, type: "credits_refund", customerId, userId: metadata.userId, pack: metadata.pack } : null;
          }
        }
        return { id: event.id, type: "refund", customerId };
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
