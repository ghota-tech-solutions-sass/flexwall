import type { Metadata } from "next";
import { LegalDocument, legalMetadata, ProcessorList, PublisherIdentityList } from "@/components/legal/LegalDocument";
import { ProcessingTable } from "@/components/legal/ProcessingTable";
import { PUBLISHER } from "@/domain/publisher";

export const metadata: Metadata = legalMetadata("privacy", "en");

export default function PrivacyPage() {
  const email = PUBLISHER.contactEmail;
  return (
    <LegalDocument doc="privacy" lang="en">
      <h2>Data controller</h2>
      <PublisherIdentityList lang="en" />

      <h2>What we process, why, and for how long</h2>
      <ProcessingTable lang="en" />
      <p>No data is sold, rented or used for advertising. No profiling, no automated decisions.</p>

      <h2>What is public</h2>
      <p>
        A published wall, and the tiles marked public, can be seen by anyone, indexed by search engines and copied into share cards; a listed wall also appears
        in the directory. Private tiles, your credentials and your email address are never published. The lock screen link is secret and can be renewed from
        the editor.
      </p>

      <h2>Recipients</h2>
      <p>Data is processed by {PUBLISHER.companyName} and by its processors, bound by contract and by the GDPR:</p>
      <ProcessorList lang="en" />
      <p>
        Services you connect (GitHub, Stripe, and so on) receive the requests made with your credentials, at your request; their own privacy policies cover
        what they hold.
      </p>

      <h2>Transfers outside the European Union</h2>
      <p>
        Data is stored in the European Union (Belgium). Stripe and Google may process part of it in the United States, under the European Commission&apos;s
        adequacy decision for the EU-US Data Privacy Framework and standard contractual clauses.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        Flexwall uses a single cookie, <code>fw_session</code>, strictly necessary to keep you signed in (30 days), and the browser&apos;s session storage to
        remember a handle typed before signing in. No analytics, advertising or third-party cookies, so no consent is asked.
      </p>

      <p>Anonymous page-view counters measure visits to public pages and the official wall. Totals are public. The counter stores no IP address, cookies or persistent visitor identifier. A bounded set of random event receipts prevent duplicate requests; these do not identify a visitor. Do Not Track and Global Privacy Control are respected.</p>

      <h2>Security</h2>
      <p>
        Encrypted connections (HTTPS), connection credentials encrypted at rest with AES-256-GCM, passwordless sign-in through short-lived links, restricted
        server access.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the rights of access, rectification, erasure, restriction, objection and portability, and may set instructions for your data after your
        death. Write to <a href={`mailto:${email}`}>{email}</a> from your account&apos;s address: we answer within one month. You can also complain to the
        French data protection authority, CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, <a href="https://www.cnil.fr">www.cnil.fr</a>, or to
        the authority of your EU country.
      </p>

      <h2>Children</h2>
      <p>Flexwall isn&apos;t meant for anyone under 16.</p>

      <h2>Changes</h2>
      <p>Material changes to this policy are announced by email before they apply.</p>
    </LegalDocument>
  );
}
