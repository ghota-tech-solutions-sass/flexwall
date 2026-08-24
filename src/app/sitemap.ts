import type { MetadataRoute } from "next";
import { listEntriesSafe } from "@/lib/board-server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await listEntriesSafe();
  const now = new Date();
  const seats: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${SITE_URL}/share/${e.slug}`,
    lastModified: new Date(e.updatedAt),
    changeFrequency: "daily",
    priority: 0.5,
  }));
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/board`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...seats,
  ];
}
