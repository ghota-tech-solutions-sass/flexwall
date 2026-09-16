import Stripe from "stripe";
import type { BillingEvent, BillingPlan, CheckoutConsent, PaymentGateway, SubscriptionRole } from "@/application/ports";
import { PAID_ACCOUNT_PRICE_USD } from "@/domain/pricing";
import type { Subscription, SubscriptionStatus, User } from "@/domain/user";

export interface StripePrices {
  monthly: string | null;
  yearly: string | null;
  lifetime: string | null;
  /** The monthly price of one connected account. */
  paidAccount?: string | null;
}

/** Tells the accounts subscription apart from the plan, in metadata and on prices. */
export const PAID_ACCOUNTS_ROLE = "paid_accounts";

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

/**
 * The Checkout session that opens the accounts subscription. Monthly, whatever
 * the plan's own cycle, and never discounted: the invitee coupon is spent once
 * and belongs to Pro, not to a $5 line.
 */
export function paidAccountsSessionParams(input: {
  customerId: string;
  userId: string;
  quantity: number;
  priceId: string | null;
  consent: CheckoutConsent;
  successUrl: string;
  cancelUrl: string;
  options: CheckoutOptions;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    userId: input.userId,
    role: PAID_ACCOUNTS_ROLE,
    terms_version: input.consent.termsVersion,
    terms_accepted_at: new Date(input.consent.acceptedAt).toISOString(),
    immediate_start: "requested",
  };
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = input.priceId
    ? { price: input.priceId, quantity: input.quantity }
    : {
        quantity: input.quantity,
        price_data: {
          currency: "usd",
          product_data: { name: "Flexwall connected account" },
          tax_behavior: "inclusive",
          unit_amount: PAID_ACCOUNT_PRICE_USD * 100,
          recurring: { interval: "month" as const },
        },
      };
  return {
    customer: input.customerId,
    mode: "subscription",
    line_items: [lineItem],
    metadata,
    subscription_data: { metadata },
    // The invitee coupon is once only and belongs to Pro.
    allow_promotion_codes: false,
    custom_text: {
      submit: {
        message: `$${PAID_ACCOUNT_PRICE_USD} a month per connected bank or brokerage account, for as long as it stays connected. Removing an account lowers the next invoice.`,
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

  async paidAccountsCheckoutUrl(input: { user: User; quantity: number; consent: CheckoutConsent; successUrl: string; cancelUrl: string }) {
    const customerId = await this.customerFor(input.user);
    const session = await this.stripe().checkout.sessions.create(
      paidAccountsSessionParams({
        customerId,
        userId: input.user.id,
        quantity: input.quantity,
        priceId: this.config.prices.paidAccount ?? null,
        consent: input.consent,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        options: this.config.checkout ?? { automaticTax: false, collectTermsConsent: false, referralCoupon: null },
      })
    );
    if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
    return { url: session.url, customerId };
  }

  /**
   * Sets how many accounts are paid for. Raising invoices the rest of the month
   * now; lowering leaves a credit on the next invoice. At zero the subscription
   * ends with the period, so Stripe stops issuing empty invoices, and connecting
   * again before then simply raises it back.
   */
  async setPaidAccountsQuantity(input: { subscription: Subscription; quantity: number; direction: "up" | "down" }) {
    const stripe = this.stripe();
    const sub = await stripe.subscriptions.retrieve(input.subscription.id);
    const item = sub.items.data[0];
    if (!item) throw new Error(`Stripe subscription ${sub.id} has no item to set a quantity on`);
    const proration_behavior = input.direction === "up" ? "always_invoice" : "create_prorations";
    if (input.quantity > 0) {
      await stripe.subscriptionItems.update(item.id, { quantity: input.quantity, proration_behavior });
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
      return toSubscription(updated);
    }
    await stripe.subscriptionItems.update(item.id, { quantity: 1, proration_behavior });
    return toSubscription(await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true }));
  }

  async paidAccountsSubscriptions(customerId: string) {
    const price = this.config.prices.paidAccount;
    const list = await this.stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    return list.data
      .filter((sub) => roleOf(sub, price) === PAID_ACCOUNTS_ROLE && sub.status !== "canceled" && sub.status !== "incomplete_expired")
      .map(toSubscription);
  }

  async cancelSubscription(subscriptionId: string) {
    await this.stripe().subscriptions.cancel(subscriptionId);
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
        if (session.metadata?.plan !== "lifetime") return null;
        return { id: event.id, type: "lifetime", customerId, userId };
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
        // Partial refunds keep the purchase, and the referral with it.
        if (!charge.refunded || !customerId) return null;
        return { id: event.id, type: "refund", role: await this.refundRole(charge), customerId };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        return {
          id: event.id,
          type: "subscription",
          role: roleOf(sub, this.config.prices.paidAccount),
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          userId: sub.metadata?.userId ?? null,
          subscription: toSubscription(sub, event.created * 1000),
        };
      }
      default:
        return null;
    }
  }

  /**
   * What a refunded charge paid for, so a refunded connected account doesn't
   * take a referrer's month back. A charge Stripe can't tie to a subscription
   * invoice counts as a plan payment, which is what every charge was before.
   */
  private async refundRole(charge: Stripe.Charge): Promise<SubscriptionRole | "unknown"> {
    const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return "unknown";
    try {
      const stripe = this.stripe();
      const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 1 });
      const invoiceRef = payments.data[0]?.invoice;
      const invoiceId = typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id;
      if (!invoiceId) return "unknown";
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (invoice.parent?.subscription_details?.metadata?.role === PAID_ACCOUNTS_ROLE) return PAID_ACCOUNTS_ROLE;
      const priceId = invoice.lines.data.find((l) => l.pricing?.price_details?.price)?.pricing?.price_details?.price;
      return priceId && priceId === this.config.prices.paidAccount ? PAID_ACCOUNTS_ROLE : "pro";
    } catch {
      return "unknown";
    }
  }
}

/** Which subscription this is: what its metadata says, else its price, else the plan (everything sold before accounts were). */
export function roleOf(sub: Pick<Stripe.Subscription, "metadata" | "items">, paidAccountPrice: string | null | undefined): SubscriptionRole {
  if (sub.metadata?.role === PAID_ACCOUNTS_ROLE) return PAID_ACCOUNTS_ROLE;
  const priceId = sub.items?.data?.[0]?.price?.id;
  return paidAccountPrice && priceId === paidAccountPrice ? PAID_ACCOUNTS_ROLE : "pro";
}

export function toSubscription(sub: Stripe.Subscription, updatedAt = Date.now()): Subscription {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    status: sub.status as SubscriptionStatus,
    quantity: item?.quantity ?? 1,
    updatedAt,
    interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    currentPeriodEnd: (item?.current_period_end ?? 0) * 1000,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
