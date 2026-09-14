import type { Metadata } from "next";
import { SITE_NAME } from "./structured-data";

/**
 * Title, description, canonical address and the matching social tags for a
 * page. Next merges metadata shallowly, so a page that sets openGraph must set
 * all of it: this keeps the site name and type from getting lost.
 */
export function pageMetadata(input: { title: string; absoluteTitle?: boolean; description: string; path: string; type?: "website" | "profile" }): Metadata {
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: { type: input.type ?? "website", siteName: SITE_NAME, locale: "en_US", url: input.path, title: input.title, description: input.description },
    twitter: { card: "summary_large_image", title: input.title, description: input.description },
  };
}
