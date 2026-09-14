import { catalog } from "@/plugins/registry";
import { integrationPage } from "@/presentation/seo/integrations";
import { llmsTxt } from "@/presentation/seo/llms";
import { siteOrigin } from "@/presentation/seo/origin";

export const revalidate = 86400;

export function GET() {
  const integrations = catalog.connectors().map((connector) => integrationPage(connector, catalog.widgets()));
  return new Response(llmsTxt(siteOrigin(), integrations), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
