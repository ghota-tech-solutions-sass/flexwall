import { catalog } from "@/plugins/registry";
import { container } from "@/composition";
import { visibleConnectors } from "@/presentation/connections";
import { integrationPage } from "@/presentation/seo/integrations";
import { llmsTxt } from "@/presentation/seo/llms";
import { siteOrigin } from "@/presentation/seo/origin";

// Reads which connectors are public, so it can't be baked at build time; the CDN still caches the answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const integrations = visibleConnectors(catalog.connectors(), await container().publicConnectors.execute()).map((connector) => integrationPage(connector, catalog.widgets()));
  return new Response(llmsTxt(siteOrigin(), integrations), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
