import { describe, expect, test } from "bun:test";
import { checkoutSessionParams, CREDITS_METADATA_KIND, creditsSessionParams } from "@/infrastructure/billing/stripe-gateway";

const base = {
  customerId: "cus_1",
  userId: "u1",
  consent: { termsVersion: "2026-09-14", acceptedAt: Date.UTC(2026, 8, 14, 9, 0, 0) },
  referralDiscount: false,
  successUrl: "https://flexwall.test/settings?upgraded=1",
  cancelUrl: "https://flexwall.test/pricing",
};

describe("Checkout session", () => {
  test("given an accepted consent, when a subscription checkout is built, then the terms version and immediate start travel with it", () => {
    // Given
    const input = { ...base, plan: "monthly" as const, priceId: "price_monthly", options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.mode).toBe("subscription");
    expect(params.metadata).toMatchObject({ terms_version: "2026-09-14", terms_accepted_at: "2026-09-14T09:00:00.000Z", immediate_start: "requested" });
    expect(params.subscription_data?.metadata).toEqual(params.metadata);
    expect((params.custom_text?.submit as { message: string }).message).toContain("renews until you cancel");
  });

  test("given the lifetime plan, when its checkout is built, then the one-off payment gets an invoice", () => {
    // Given
    const input = { ...base, plan: "lifetime" as const, priceId: "price_lifetime", options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.mode).toBe("payment");
    expect(params.invoice_creation).toEqual({ enabled: true });
  });

  test("given Stripe Tax switched on, when a checkout is built, then the buyer's address and tax id are collected so VAT can be computed", () => {
    // Given
    const input = { ...base, plan: "yearly" as const, priceId: "price_yearly", options: { automaticTax: true, collectTermsConsent: true, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.billing_address_collection).toBe("required");
    expect(params.customer_update).toEqual({ address: "auto", name: "auto" });
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.consent_collection).toEqual({ terms_of_service: "required" });
  });

  test("given Stripe Tax off, when a checkout is built, then no tax option is sent that would make Stripe refuse the session", () => {
    // Given
    const input = { ...base, plan: "yearly" as const, priceId: "price_yearly", options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.automatic_tax).toBeUndefined();
    expect(params.consent_collection).toBeUndefined();
  });

  test("given no configured price, when a checkout is built, then the inline price includes taxes like the configured ones", () => {
    // Given
    const input = { ...base, plan: "monthly" as const, priceId: null, options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.line_items?.[0]?.price_data).toMatchObject({ currency: "usd", unit_amount: 600, tax_behavior: "inclusive" });
  });

  test("given a referred buyer and a configured coupon, when a checkout is built, then the invitee discount replaces promotion codes", () => {
    // Given
    const input = { ...base, referralDiscount: true, plan: "monthly" as const, priceId: "price_monthly", options: { automaticTax: false, collectTermsConsent: false, referralCoupon: "coupon_ref" } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.discounts).toEqual([{ coupon: "coupon_ref" }]);
    expect(params.allow_promotion_codes).toBeUndefined();
  });

  test("given a referred buyer but no coupon configured, when a checkout is built, then promotion codes stay available", () => {
    // Given
    const input = { ...base, referralDiscount: true, plan: "yearly" as const, priceId: "price_yearly", options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.discounts).toBeUndefined();
    expect(params.allow_promotion_codes).toBe(true);
  });
});

describe("Credits checkout session", () => {
  const credits = { customerId: "cus_1", userId: "u1", consent: base.consent, successUrl: "https://flexwall.test/settings?credits=1", cancelUrl: "https://flexwall.test/settings" };

  test("given a pack, when its checkout is built, then it's a one-off payment with an invoice and the pack in the metadata", () => {
    // Given
    const input = { ...credits, pack: "regular" as const, priceId: "price_credits_regular", options: { automaticTax: true, collectTermsConsent: false, referralCoupon: "coupon_ref" } };

    // When
    const params = creditsSessionParams(input);

    // Then
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: "price_credits_regular", quantity: 1 }]);
    expect(params.metadata).toMatchObject({ userId: "u1", kind: CREDITS_METADATA_KIND, pack: "regular", terms_version: "2026-09-14", immediate_start: "requested" });
    expect(params.payment_intent_data?.metadata).toEqual(params.metadata);
    expect(params.invoice_creation).toEqual({ enabled: true });
    expect(params.automatic_tax).toEqual({ enabled: true });
    // The referral discount is for plans only.
    expect(params.discounts).toBeUndefined();
  });

  test("given no configured price, when a pack checkout is built, then the inline price is the pack's, taxes included", () => {
    // Given
    const input = { ...credits, pack: "starter" as const, priceId: null, options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = creditsSessionParams(input);

    // Then
    expect(params.line_items?.[0]?.price_data).toMatchObject({ currency: "usd", unit_amount: 399, tax_behavior: "inclusive" });
  });
});
