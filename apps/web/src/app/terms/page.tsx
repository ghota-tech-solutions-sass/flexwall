import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_PATHS, LegalDocument, legalMetadata, MediatorBlock } from "@/components/legal/LegalDocument";
import { PAID_ACCOUNT_PRICE_USD, PLAN_PRICES_USD } from "@/domain/pricing";
import { REFERRAL_DISCOUNT_PERCENT, REFERRAL_REWARD_CAP, REFERRAL_REWARD_DAYS } from "@/domain/referral";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { PUBLISHER } from "@/domain/publisher";

export const metadata: Metadata = legalMetadata("terms", "en");

export default function TermsPage() {
  const email = PUBLISHER.contactEmail;
  return (
    <LegalDocument doc="terms" lang="en">
      <h2>1. Scope and acceptance</h2>
      <p>
        These terms govern the use of Flexwall at flexwall.lol and the sale of its paid plans by {PUBLISHER.companyName} (see the{" "}
        <Link href={LEGAL_PATHS.notice.en}>legal notice</Link>). Creating an account means accepting the terms of use; buying a plan means accepting the terms
        of sale, confirmed by a checkbox before payment.
      </p>

      <h2>2. The service</h2>
      <p>
        Flexwall lets you build a public page, a wall, of tiles fed by values you type or read from accounts you connect (GitHub, Stripe, an API…), and turn
        it into a lock screen image and a share card. A wall is public only once published, and each tile only if you mark it public.
      </p>
      <ul>
        <li>
          <strong>Free:</strong> one wall, {FREE_TILE_LIMIT} tiles, the basic connectors, a flexwall.lol mark on images.
        </li>
        <li>
          <strong>Pro:</strong> unlimited tiles, every connector and theme, value history, no mark. Monthly or yearly subscription.
        </li>
        <li>
          <strong>Lifetime:</strong> Pro features for the life of the service, in one payment. No longer sold; accounts that bought it keep it.
        </li>
      </ul>
      <p>The plans in force are those on the pricing page when you order.</p>

      <h2>3. Account</h2>
      <p>
        Accounts are created with an email address, through a sign-in link. You must be at least 16 to use Flexwall, and of legal age or authorized by a
        parent or guardian to buy a plan. A wall&apos;s name (@handle) can&apos;t be changed once chosen. You are responsible for your account and for what you
        publish.
      </p>

      <h2>4. Connections and verified numbers</h2>
      <p>
        Only connect accounts you are entitled to use, with read-only access where the provider offers it. Credentials are encrypted and used only to read the
        values shown. The verified badge means a value was read from the owner&apos;s connected account at the time shown; it doesn&apos;t certify their
        results. Values come from third-party services whose accuracy and availability aren&apos;t guaranteed.
      </p>

      <h2>5. Publishing rules</h2>
      <p>
        Not allowed: unlawful, hateful or defamatory content, content infringing others&apos; rights, impersonation, faking numbers presented as verified, and
        any use meant to disrupt the service. Any wall can be reported from its Report link. {PUBLISHER.companyName} may remove content or suspend an account
        breaking these rules, telling the user and letting them respond, unless urgency or the law prevents it.
      </p>

      <h2>6. Prices</h2>
      <p>
        Prices are in US dollars, all taxes included: VAT due in the buyer&apos;s country is included and itemized on the invoice. Pro: ${PLAN_PRICES_USD.monthly} a month or ${PLAN_PRICES_USD.yearly} a
        year. Connected bank and brokerage accounts: ${PAID_ACCOUNT_PRICE_USD} a month each, as set out in section 17. Lifetime is no longer sold; accounts that
        bought it keep it at no further charge. Currency conversion by the buyer&apos;s bank is theirs to bear. A subscription price change is announced by
        email at least 30 days before it applies, at the next renewal; subscribers can cancel before then.
      </p>

      <h2>7. Ordering and payment</h2>
      <p>
        Payment is by card through Stripe, a payment provider; {PUBLISHER.companyName} never sees card details. An order is final once payment is accepted; an
        invoice is emailed and stays available in the billing portal.
      </p>

      <h2>8. Term, renewal and cancellation</h2>
      <p>
        Pro is bought for a month or a year and renews automatically for the same period, at the price then in force, until cancelled. Yearly subscribers get
        a reminder email before renewal. Cancel any time, in a few clicks, from Settings then Manage billing: cancellation takes effect at the end of the paid
        period, during which Pro stays on, with no refund of the current period except under sections 9 and 10. If a payment fails, Pro stays on for 7 days,
        then the account returns to Free without losing the wall.
      </p>

      <h2>9. Right of withdrawal</h2>
      <p>
        Consumers have 14 days from subscribing to withdraw, without giving a reason (French Consumer Code, articles L221-18 and following). By ticking the box
        before payment, you expressly ask for the service to start right away, before that period ends. If you withdraw afterwards, the law would allow
        charging for the service provided until then (article L221-25); Flexwall waives this and refunds the full payment.
      </p>
      <p>
        To withdraw, write to <a href={`mailto:${email}`}>{email}</a>, for instance with the model below. The refund is made within 14 days, to the payment
        method used.
      </p>
      <blockquote>
        To {PUBLISHER.companyName}, {PUBLISHER.registeredAddress}, {email}: I hereby give notice that I withdraw from my contract for the following service.
        Plan: … Ordered on: … Name: … Account email: … Date: …
      </blockquote>

      <h2>10. Money-back guarantee</h2>
      <p>
        Separately from the right of withdrawal, the first payment of each plan (the first month, the first year, or Lifetime) is refunded in full on written
        request within 14 days of it.
      </p>

      <h2>11. Availability</h2>
      <p>
        The service is provided as is, with reasonable effort to keep it available, and may pause for maintenance. Connectors depend on third-party services
        that can change or cut access; Flexwall then adapts or retires the connector.
      </p>

      <h2>12. Liability</h2>
      <p>
        {PUBLISHER.companyName} is liable for direct damage caused by a breach of its obligations. It isn&apos;t liable for content published by users, data
        supplied by third-party services, or decisions made on the strength of displayed values. For business users, liability is capped at the amounts paid in
        the last 12 months. Nothing in these terms limits consumers&apos; statutory rights, including the legal guarantee of conformity for digital services
        (French Consumer Code, articles L224-25-12 and following).
      </p>

      <h2>13. Intellectual property</h2>
      <p>
        You keep ownership of what you publish. You grant {PUBLISHER.companyName} a free, non-exclusive, worldwide right to host, reproduce and display it,
        solely to provide the service (public pages, share cards, directory), for as long as it is published. The service, its name and software remain the
        property of {PUBLISHER.companyName}.
      </p>

      <h2>14. Closing your account</h2>
      <p>
        You can ask to close your account at any time by writing to <a href={`mailto:${email}`}>{email}</a>; the account, wall and connections are deleted
        within 30 days and any running subscription is cancelled. Billing records are kept as long as the law requires. How personal data is handled is
        described in the <Link href={LEGAL_PATHS.privacy.en}>privacy policy</Link>.
      </p>

      <h2>15. Changes to these terms</h2>
      <p>
        Material changes are announced by email at least 30 days before they apply. Users who refuse them can cancel before they take effect. An order is
        governed by the version accepted when it was placed.
      </p>

      <h2>16. Referrals</h2>
      <p>
        Every account has an invite link. Someone who creates their account through it gets {REFERRAL_DISCOUNT_PERCENT}% off their first payment, on any
        plan. For each invitee whose first payment goes through, the referrer gets {REFERRAL_REWARD_DAYS} days of Pro, up to {REFERRAL_REWARD_CAP} rewarded
        invitees; reward periods run one after another. If that first payment is refunded within 14 days, the reward is withdrawn. Rewards have no cash value
        and can&apos;t be exchanged or transferred. Inviting yourself, or creating accounts to collect rewards, isn&apos;t allowed: rewards obtained that way
        are withdrawn. {PUBLISHER.companyName} may change or end the program for the future; rewards already earned are kept.
      </p>

      <h2>17. Paid accounts</h2>
      <p>
        Some connectors read through a link {PUBLISHER.companyName} pays a provider for, month by month: banks and brokerages today. Each account connected
        through one of them costs ${PAID_ACCOUNT_PRICE_USD} a month, all taxes included, billed monthly on top of the plan and shown on the same invoice.
        Adding or removing an account is prorated, and billing stops when the account is disconnected. By ticking the box before payment, you ask for the account to start before the withdrawal period ends; an account you haven&apos;t used
        is refunded on written request within 14 days of its first payment. An account that isn&apos;t paid for stops refreshing and keeps showing its last
        values until it is. If a provider stops serving a connector or changes its prices, {PUBLISHER.companyName} may retire the connector; the accounts
        connected through it stop being billed.
      </p>

      <h2>18. Complaints, mediation and governing law</h2>
      <p>
        Send any complaint first to <a href={`mailto:${email}`}>{email}</a>.
      </p>
      <MediatorBlock lang="en" />
      <p>
        These terms are governed by French law. Consumers may bring proceedings before the court of the place where they lived when ordering or that of the
        defendant. For business users, the courts of Lyon, France, have exclusive jurisdiction.
      </p>
    </LegalDocument>
  );
}
