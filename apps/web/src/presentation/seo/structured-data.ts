import { PLAN_PRICES_USD, PRICE_CURRENCY } from "@/domain/pricing";
import { PUBLISHER } from "@/domain/publisher";
import { ROUTES } from "../routes";

/**
 * schema.org descriptions of pages, for search engines. Pure: pages pass an
 * origin and what they already loaded, and render the result with <JsonLd>.
 */

export type JsonLdObject = Record<string, unknown>;

export const SITE_NAME = "Flexwall";
export const SITE_DESCRIPTION =
  "A public page of live tiles fed by your real accounts: Stripe MRR, GitHub streaks, and anything with an API. Share it, pin it to your lock screen.";


/**
 * JSON for a <script type="application/ld+json">. Escapes what could close the
 * script element or break the line in old parsers, since titles and bios are
 * typed by users.
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const url = (origin: string, path: string) => origin.replace(/\/+$/, "") + path;

/** Fragment ids other schema.org nodes point at. */
const NODE_IDS = { organization: `${ROUTES.home}#organization`, website: `${ROUTES.home}#website` } as const;

export function organizationLd(origin: string): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url(origin, NODE_IDS.organization),
    name: SITE_NAME,
    legalName: PUBLISHER.companyName,
    url: url(origin, ROUTES.home),
    logo: url(origin, ROUTES.appleIcon),
    email: PUBLISHER.contactEmail,
    ...(PUBLISHER.vatNumber ? { vatID: PUBLISHER.vatNumber } : {}),
  };
}

export function websiteLd(origin: string): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": url(origin, NODE_IDS.website),
    name: SITE_NAME,
    url: url(origin, ROUTES.home),
    description: SITE_DESCRIPTION,
    publisher: { "@id": url(origin, NODE_IDS.organization) },
    inLanguage: "en",
  };
}

export function softwareApplicationLd(origin: string): JsonLdObject {
  const offer = (name: string, price: number, billingDuration?: "P1M" | "P1Y") => ({
    "@type": "Offer",
    name,
    price: price.toFixed(2),
    priceCurrency: PRICE_CURRENCY,
    url: url(origin, ROUTES.pricing),
    ...(billingDuration
      ? { priceSpecification: { "@type": "UnitPriceSpecification", price: price.toFixed(2), priceCurrency: PRICE_CURRENCY, billingDuration, valueAddedTaxIncluded: true } }
      : { priceSpecification: { "@type": "PriceSpecification", price: price.toFixed(2), priceCurrency: PRICE_CURRENCY, valueAddedTaxIncluded: true } }),
  });
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS",
    url: url(origin, ROUTES.home),
    description: SITE_DESCRIPTION,
    publisher: { "@id": url(origin, NODE_IDS.organization) },
    offers: [
      offer("Free", 0),
      offer("Pro, monthly", PLAN_PRICES_USD.monthly, "P1M"),
      offer("Pro, yearly", PLAN_PRICES_USD.yearly, "P1Y"),
      offer("Lifetime", PLAN_PRICES_USD.lifetime),
    ],
  };
}

export function profilePageLd(input: { origin: string; handle: string; title: string; bio: string; createdAt: number; updatedAt: number }): JsonLdObject {
  const page = url(input.origin, ROUTES.wall(input.handle));
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: page,
    ...(input.createdAt ? { dateCreated: new Date(input.createdAt).toISOString() } : {}),
    ...(input.updatedAt ? { dateModified: new Date(input.updatedAt).toISOString() } : {}),
    mainEntity: {
      "@type": "Person",
      name: input.title || `@${input.handle}`,
      alternateName: `@${input.handle}`,
      identifier: input.handle,
      url: page,
      ...(input.bio ? { description: input.bio } : {}),
    },
  };
}

export function breadcrumbLd(origin: string, items: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: url(origin, item.path) })),
  };
}

export function itemListLd(origin: string, name: string, items: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, url: url(origin, item.path) })),
  };
}
