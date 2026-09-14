import type { MetadataRoute } from "next";
import type { IntegrationPage } from "./integrations";

/** When the legal pages last changed in substance. Keep in step with LAST_UPDATED in LegalDocument. */
export const LEGAL_UPDATED = "2026-09-14";

const LEGAL_PATHS = ["/legal", "/terms", "/privacy", "/fr/mentions-legales", "/fr/cgv", "/fr/confidentialite"];

/**
 * Every indexable page. Walls come from The Wall's listing: an owner who
 * doesn't list their wall isn't pushed to search engines either.
 */
export function sitemapEntries(input: {
  origin: string;
  walls: readonly { handle: string; updatedAt: number }[];
  integrations: readonly IntegrationPage[];
}): MetadataRoute.Sitemap {
  const at = (path: string) => input.origin.replace(/\/+$/, "") + path;
  const latestWall = input.walls.reduce((max, w) => Math.max(max, w.updatedAt), 0);
  const freshest = latestWall ? new Date(latestWall) : undefined;
  return [
    { url: at(""), changeFrequency: "weekly", priority: 1 },
    { url: at("/explore"), changeFrequency: "daily", priority: 0.8, ...(freshest ? { lastModified: freshest } : {}) },
    { url: at("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    { url: at("/integrations"), changeFrequency: "weekly", priority: 0.7 },
    ...input.integrations.map((i) => ({ url: at(i.path), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...LEGAL_PATHS.map((path) => ({ url: at(path), lastModified: new Date(`${LEGAL_UPDATED}T00:00:00Z`), changeFrequency: "yearly" as const, priority: 0.2 })),
    ...input.walls.map((w) => ({ url: at(`/@${w.handle}`), lastModified: new Date(w.updatedAt), changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
