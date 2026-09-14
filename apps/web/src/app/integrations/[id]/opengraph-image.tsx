import { notFound } from "next/navigation";
import { catalog } from "@/plugins/registry";
import { integrationPage } from "@/presentation/seo/integrations";
import { CARD_SIZE, integrationCard } from "@/rendering/page-cards";

export const alt = "A Flexwall integration";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

export function generateStaticParams() {
  return catalog.connectors()
    .map((c) => ({ id: c.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const connector = catalog.connector((await params).id);
  if (!connector) notFound();
  const page = integrationPage(connector, catalog.widgets());
  return integrationCard(connector.id, { kicker: "Flexwall integration", title: page.headline, body: page.measures.map((m) => m.name).join(", ") })!;
}
