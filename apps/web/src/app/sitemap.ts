import type { MetadataRoute } from "next";
import { container } from "@/composition";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const walls = await container().listExplore.execute({ sort: "recent", limit: 500 });
  return [
    ...["", "/explore", "/pricing", "/legal", "/terms", "/privacy", "/fr/mentions-legales", "/fr/cgv", "/fr/confidentialite"].map((p) => ({ url: base + p })),
    ...walls.map((w) => ({ url: `${base}/@${w.handle}`, lastModified: new Date(w.updatedAt) })),
  ];
}
