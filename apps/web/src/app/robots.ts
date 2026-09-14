import type { MetadataRoute } from "next";
import { siteOrigin } from "@/presentation/seo/origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App screens and private links. /u/ stays open: walls' share cards are served from there.
        disallow: ["/api/", "/edit", "/settings", "/onboarding", "/l/", "/report"],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
