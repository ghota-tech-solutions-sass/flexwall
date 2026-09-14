import type { MetadataRoute } from "next";
import { siteOrigin } from "@/presentation/seo/origin";
import { PRIVATE_PATH_PREFIXES, ROUTES } from "@/presentation/routes";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ROUTES.home,
        // App screens, private links and invite redirects. /u/ stays open: walls' share cards are served from there.
        disallow: [...PRIVATE_PATH_PREFIXES],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
