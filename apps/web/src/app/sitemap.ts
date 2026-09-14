import type { MetadataRoute } from "next";
import { container } from "@/composition";
import { integrationPage } from "@/presentation/seo/integrations";
import { siteOrigin } from "@/presentation/seo/origin";
import { sitemapEntries } from "@/presentation/seo/site-map";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const c = container();
  const walls = await c.listExplore.execute({ sort: "recent", limit: 500 });
  const integrations = c.catalog.connectors().map((connector) => integrationPage(connector, c.catalog.widgets()));
  return sitemapEntries({ origin: siteOrigin(), walls, integrations });
}
