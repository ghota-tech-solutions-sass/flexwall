import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Footer, TopBar } from "@/components/site/Chrome";
import {
  isMediatorDesignated,
  MEDIATOR,
  missingPublisherMentions,
  PROCESSORS,
  PUBLISHER,
  type PublisherMention,
} from "@/domain/publisher";
import { sessionUserId } from "@/presentation/http";

export type Lang = "en" | "fr";
export type LegalDoc = "notice" | "terms" | "privacy";

/** Where each document lives in each language. */
export const LEGAL_PATHS: Record<LegalDoc, Record<Lang, string>> = {
  notice: { en: "/legal", fr: "/fr/mentions-legales" },
  terms: { en: "/terms", fr: "/fr/cgv" },
  privacy: { en: "/privacy", fr: "/fr/confidentialite" },
};

const TITLES: Record<LegalDoc, Record<Lang, string>> = {
  notice: { en: "Legal notice", fr: "Mentions légales" },
  terms: { en: "Terms of service", fr: "Conditions générales de vente et d'utilisation" },
  privacy: { en: "Privacy policy", fr: "Politique de confidentialité" },
};

export const LAST_UPDATED: Record<Lang, string> = { en: "September 14, 2026", fr: "14 septembre 2026" };

export function legalMetadata(doc: LegalDoc, lang: Lang): Metadata {
  return {
    title: TITLES[doc][lang],
    alternates: {
      canonical: LEGAL_PATHS[doc][lang],
      languages: { en: LEGAL_PATHS[doc].en, fr: LEGAL_PATHS[doc].fr },
    },
  };
}

export async function LegalDocument({ doc, lang, children }: { doc: LegalDoc; lang: Lang; children: ReactNode }) {
  const other: Lang = lang === "en" ? "fr" : "en";
  return (
    <div className="page">
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main className="prose legal" lang={lang}>
        <p className="hint">
          <Link href={LEGAL_PATHS[doc][other]} hrefLang={other}>
            {lang === "en" ? "Version française" : "English version"}
          </Link>
        </p>
        <h1>{TITLES[doc][lang]}</h1>
        <p className="hint">{lang === "en" ? `Last updated ${LAST_UPDATED.en}.` : `Mise à jour le ${LAST_UPDATED.fr}.`}</p>
        {lang === "en" ? (
          <p className="hint">This translation is provided for convenience. For consumers in France, the French version prevails.</p>
        ) : null}
        <nav className="legal-nav" aria-label={lang === "en" ? "Legal documents" : "Documents légaux"}>
          {(Object.keys(LEGAL_PATHS) as LegalDoc[]).map((d) =>
            d === doc ? (
              <span key={d} aria-current="page">
                {TITLES[d][lang]}
              </span>
            ) : (
              <Link key={d} href={LEGAL_PATHS[d][lang]}>
                {TITLES[d][lang]}
              </Link>
            )
          )}
        </nav>
        {children}
      </main>
      <Footer />
    </div>
  );
}

const MENTION_LABELS: Record<PublisherMention | "companyName" | "contactEmail", Record<Lang, string>> = {
  companyName: { en: "Company", fr: "Dénomination sociale" },
  legalForm: { en: "Legal form", fr: "Forme juridique" },
  shareCapital: { en: "Share capital", fr: "Capital social" },
  registeredAddress: { en: "Registered office", fr: "Siège social" },
  registrationNumber: { en: "Registration", fr: "Immatriculation" },
  vatNumber: { en: "EU VAT number", fr: "TVA intracommunautaire" },
  publicationDirector: { en: "Publication director", fr: "Directeur de la publication" },
  contactEmail: { en: "Contact", fr: "Contact" },
};

/** The publisher's identity; a missing mandatory mention shows as missing, never as a guess. */
export function PublisherIdentityList({ lang }: { lang: Lang }) {
  const missing = new Set(missingPublisherMentions());
  const rows = ["companyName", "legalForm", "shareCapital", "registeredAddress", "registrationNumber", "vatNumber", "publicationDirector", "contactEmail"] as const;
  return (
    <ul>
      {rows.map((field) => (
        <li key={field}>
          <strong>{MENTION_LABELS[field][lang]}:</strong>{" "}
          {field === "contactEmail" ? (
            <a href={`mailto:${PUBLISHER.contactEmail}`}>{PUBLISHER.contactEmail}</a>
          ) : missing.has(field as PublisherMention) ? (
            <em>{lang === "en" ? "not provided yet" : "non renseigné"}</em>
          ) : (
            PUBLISHER[field]
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProcessorList({ lang }: { lang: Lang }) {
  return (
    <ul>
      {PROCESSORS.map((p) => (
        <li key={p.name}>
          <strong>{p.name}</strong>, {p.address}: {p.role[lang]}.
        </li>
      ))}
    </ul>
  );
}

/** The consumer mediator, or plainly that none is designated yet and how to reach us meanwhile. */
export function MediatorBlock({ lang }: { lang: Lang }) {
  if (isMediatorDesignated()) {
    return (
      <p>
        {lang === "en"
          ? "If a complaint sent to us in writing gets no satisfactory answer within two months, you can refer the dispute free of charge to the consumer mediator: "
          : "Si une réclamation écrite adressée à nos services n'a pas reçu de réponse satisfaisante dans un délai de deux mois, vous pouvez soumettre gratuitement le litige au médiateur de la consommation : "}
        <strong>{MEDIATOR.name}</strong>
        {MEDIATOR.website ? (
          <>
            , <a href={MEDIATOR.website}>{MEDIATOR.website}</a>
          </>
        ) : null}
        {MEDIATOR.postalAddress ? `, ${MEDIATOR.postalAddress}` : null}.
      </p>
    );
  }
  return (
    <p>
      {lang === "en"
        ? `A consumer mediator is being designated and will be listed here. Meanwhile, write to ${PUBLISHER.contactEmail}: every complaint gets a written answer within 30 days.`
        : `La désignation d'un médiateur de la consommation est en cours ; ses coordonnées figureront ici. D'ici là, écrivez à ${PUBLISHER.contactEmail} : chaque réclamation reçoit une réponse écrite sous 30 jours.`}
    </p>
  );
}
