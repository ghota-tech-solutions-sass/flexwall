import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/new", "/setup", "/wall", "/legal"].map((path) => ({ url: SITE_URL + path }));
}
