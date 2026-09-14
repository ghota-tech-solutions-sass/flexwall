import type { MetadataRoute } from "next";
import { siteOrigin } from "@/presentation/seo/origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App screens, private links and invite redirects. /u/ stays open: walls' share cards are served from there.
        disallow: ["/api/", "/edit", "/settings", "/onboarding", "/l/", "/r/", "/report"],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
