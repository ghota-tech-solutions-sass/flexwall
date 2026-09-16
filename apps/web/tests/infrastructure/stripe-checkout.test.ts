import { describe, expect, test } from "bun:test";
import { checkoutSessionParams, PAID_ACCOUNTS_ROLE, paidAccountsSessionParams, roleOf } from "@/infrastructure/billing/stripe-gateway";
import { PAID_ACCOUNT_PRICE_USD } from "@/domain/pricing";

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

describe("Connected accounts subscription", () => {
  const accounts = { customerId: "cus_1", userId: "u1", consent: base.consent, successUrl: "https://flexwall.test/settings?seats=1", cancelUrl: "https://flexwall.test/settings" };

  test("given a first account, when its checkout is built, then it's a monthly subscription carrying the role and the quantity", () => {
    // Given
    const input = { ...accounts, quantity: 1, priceId: "price_account", options: { automaticTax: true, collectTermsConsent: false, referralCoupon: "coupon_ref" } };

    // When
    const params = paidAccountsSessionParams(input);

    // Then
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_account", quantity: 1 }]);
    expect(params.metadata).toMatchObject({ userId: "u1", role: PAID_ACCOUNTS_ROLE, terms_version: "2026-09-14", immediate_start: "requested" });
    expect(params.subscription_data?.metadata).toEqual(params.metadata);
    expect(params.automatic_tax).toEqual({ enabled: true });
    // The invitee's once-only discount belongs to Pro, not to a $5 line.
    expect(params.discounts).toBeUndefined();
    expect(params.allow_promotion_codes).toBe(false);
  });

  test("given no configured price, when the checkout is built, then the inline price is monthly and includes taxes", () => {
    // Given
    const input = { ...accounts, quantity: 2, priceId: null, options: { automaticTax: false, collectTermsConsent: false, referralCoupon: null } };

    // When
    const params = paidAccountsSessionParams(input);

    // Then
    expect(params.line_items?.[0]).toMatchObject({ quantity: 2 });
    expect(params.line_items?.[0]?.price_data).toMatchObject({ currency: "usd", unit_amount: PAID_ACCOUNT_PRICE_USD * 100, tax_behavior: "inclusive", recurring: { interval: "month" } });
  });

  test("given a subscription, when its role is read, then metadata wins, then the price, and anything else is a plan", () => {
    // Given
    const withRole = { metadata: { role: PAID_ACCOUNTS_ROLE }, items: { data: [{ price: { id: "price_other" } }] } };
    const byPrice = { metadata: {}, items: { data: [{ price: { id: "price_account" } }] } };
    const older = { metadata: {}, items: { data: [{ price: { id: "price_monthly" } }] } };

    // When
    const roles = [withRole, byPrice, older].map((s) => roleOf(s as never, "price_account"));

    // Then
    expect(roles).toEqual([PAID_ACCOUNTS_ROLE, PAID_ACCOUNTS_ROLE, "pro"]);
  });
});
