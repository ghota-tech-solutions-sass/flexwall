import type { Metadata } from "next";
import { LegalDocument, legalMetadata, PublisherIdentityList } from "@/components/legal/LegalDocument";
import { HOST, PUBLISHER } from "@/domain/publisher";
import { SOURCE_URL } from "@/site";

export const metadata: Metadata = legalMetadata("notice", "en");

export default function LegalNoticePage() {
  return (
    <LegalDocument doc="notice" lang="en">
      <h2>Publisher</h2>
      <p>flexwall.lol is published by:</p>
      <PublisherIdentityList lang="en" />

      <h2>Hosting</h2>
      <p>
        <strong>{HOST.name}</strong>, {HOST.address}. {HOST.role.en}.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Flexwall name, site design, texts and software belong to {PUBLISHER.companyName}, except content published by users, which stays theirs,
        and third-party trademarks shown on tiles, which belong to their owners.
        {SOURCE_URL ? (
          <>
            {" "}
            The <a href={SOURCE_URL}>source code</a> is published under the AGPL-3.0 license; the SDK and plugins under the MIT license.
          </>
        ) : null}
      </p>

      <h2>Reporting content</h2>
      <p>
        To report a wall that breaks the law or our terms, use the link at the bottom of the wall or write to{" "}
        <a href={`mailto:${PUBLISHER.contactEmail}`}>{PUBLISHER.contactEmail}</a>. Reports are reviewed promptly and unlawful content is removed.
      </p>
    </LegalDocument>
  );
}
