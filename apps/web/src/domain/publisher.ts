/**
 * Who publishes flexwall.lol and where consumers can turn. One source for the
 * legal notice, the terms and the privacy policy, in both languages: a
 * registration number doesn't translate.
 *
 * Fields set to `null` are mandatory mentions not filled in yet, never options.
 * Nothing may fill them with a plausible value: an invented registration or a
 * mediator nobody subscribed to is worse than a visible gap. Pages show them as
 * missing so the gap stays visible.
 *
 * References: LCEN art. 6 III (publisher mentions); Code de la consommation
 * L616-1 and R616-1 (consumer mediator, mandatory when selling to consumers).
 */

export interface PublisherIdentity {
  companyName: string;
  legalForm: string | null;
  shareCapital: string | null;
  registeredAddress: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  publicationDirector: string | null;
  contactEmail: string;
}

export interface ConsumerMediator {
  name: string | null;
  website: string | null;
  postalAddress: string | null;
}

export interface Processor {
  name: string;
  role: { en: string; fr: string };
  address: string;
}

export const MANDATORY_PUBLISHER_FIELDS = [
  "legalForm",
  "shareCapital",
  "registeredAddress",
  "registrationNumber",
  "vatNumber",
  "publicationDirector",
] as const;

export type PublisherMention = (typeof MANDATORY_PUBLISHER_FIELDS)[number];

export const PUBLISHER: PublisherIdentity = {
  companyName: "Ghota Tech Solutions",
  legalForm: "EURL",
  shareCapital: "1 000 €",
  registeredAddress: "268 rue Paul Bert, 69003 Lyon, France",
  registrationNumber: "RCS Lyon 988 597 209, SIRET 988 597 209 00010",
  vatNumber: "FR52988597209",
  publicationDirector: "Mickaël Villers",
  contactEmail: "contact@ghotatechsolutions.com",
};

/** Designating a mediator requires an actual membership (CNPM, Medicys…). Until then this stays empty. */
export const MEDIATOR: ConsumerMediator = {
  name: null,
  website: null,
  postalAddress: null,
};

export const HOST: Processor = {
  name: "Google Cloud (Google Ireland Limited)",
  role: { en: "Hosting and database, region europe-west1 (Belgium)", fr: "Hébergement et base de données, région europe-west1 (Belgique)" },
  address: "Gordon House, Barrow Street, Dublin 4, Ireland",
};

export const PROCESSORS: Processor[] = [
  HOST,
  {
    name: "Stripe Payments Europe, Limited",
    role: { en: "Payments, invoices and tax calculation", fr: "Paiements, factures et calcul des taxes" },
    address: "1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Ireland",
  },
  {
    name: "Google Workspace (Google Ireland Limited)",
    role: { en: "Sending sign-in emails", fr: "Envoi des e-mails de connexion" },
    address: "Gordon House, Barrow Street, Dublin 4, Ireland",
  },
];

/** Version of the terms a buyer accepts at checkout; bump it when their substance changes. */
export const TERMS_VERSION = "2026-09-14.2";

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** The mandatory mentions still missing, in display order. */
export function missingPublisherMentions(identity: PublisherIdentity = PUBLISHER): PublisherMention[] {
  return MANDATORY_PUBLISHER_FIELDS.filter((field) => !isFilled(identity[field]));
}

/** A mediator is only designated if a consumer can reach them: a name alone isn't enough. */
export function isMediatorDesignated(mediator: ConsumerMediator = MEDIATOR): boolean {
  return isFilled(mediator.name) && (isFilled(mediator.website) || isFilled(mediator.postalAddress));
}
