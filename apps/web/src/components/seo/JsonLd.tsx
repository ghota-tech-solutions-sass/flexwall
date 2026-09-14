import { type JsonLdObject, serializeJsonLd } from "@/presentation/seo/structured-data";

/** schema.org data for search engines. Safe with user-typed text: see serializeJsonLd. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
