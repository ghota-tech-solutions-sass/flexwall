import { describe, expect, test } from "bun:test";
import { checkoutSessionParams } from "@/infrastructure/billing/stripe-gateway";

const base = {
  customerId: "cus_1",
  userId: "u1",
  consent: { termsVersion: "2026-09-14", acceptedAt: Date.UTC(2026, 8, 14, 9, 0, 0) },
  successUrl: "https://flexwall.test/settings?upgraded=1",
  cancelUrl: "https://flexwall.test/pricing",
};

describe("Checkout session", () => {
  test("given an accepted consent, when a subscription checkout is built, then the terms version and immediate start travel with it", () => {
    // Given
    const input = { ...base, plan: "monthly" as const, priceId: "price_monthly", options: { automaticTax: false, collectTermsConsent: false } };

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
    const input = { ...base, plan: "lifetime" as const, priceId: "price_lifetime", options: { automaticTax: false, collectTermsConsent: false } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.mode).toBe("payment");
    expect(params.invoice_creation).toEqual({ enabled: true });
  });

  test("given Stripe Tax switched on, when a checkout is built, then the buyer's address and tax id are collected so VAT can be computed", () => {
    // Given
    const input = { ...base, plan: "yearly" as const, priceId: "price_yearly", options: { automaticTax: true, collectTermsConsent: true } };

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
    const input = { ...base, plan: "yearly" as const, priceId: "price_yearly", options: { automaticTax: false, collectTermsConsent: false } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.automatic_tax).toBeUndefined();
    expect(params.consent_collection).toBeUndefined();
  });

  test("given no configured price, when a checkout is built, then the inline price includes taxes like the configured ones", () => {
    // Given
    const input = { ...base, plan: "monthly" as const, priceId: null, options: { automaticTax: false, collectTermsConsent: false } };

    // When
    const params = checkoutSessionParams(input);

    // Then
    expect(params.line_items?.[0]?.price_data).toMatchObject({ currency: "usd", unit_amount: 600, tax_behavior: "inclusive" });
  });
});
