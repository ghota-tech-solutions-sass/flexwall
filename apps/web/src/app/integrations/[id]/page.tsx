import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer, TopBar } from "@/components/site/Chrome";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { catalog } from "@/plugins/registry";
import { todayIn } from "@/domain/time";
import { sessionUserId } from "@/presentation/http";
import { integrationPage } from "@/presentation/seo/integrations";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { breadcrumbLd } from "@/presentation/seo/structured-data";
import { connectorShowcase, sampleStates } from "@/rendering/samples";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return catalog.connectors()
    .map((c) => ({ id: c.id }));
}

function pageFor(id: string) {
  const connector = catalog.connector(id);
  return connector ? { connector, page: integrationPage(connector, catalog.widgets()) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = pageFor((await params).id);
  if (!found) return {};
  return pageMetadata({ title: found.page.title, description: found.page.description, path: found.page.path });
}

export default async function IntegrationPage({ params }: Props) {
  const found = pageFor((await params).id);
  if (!found) notFound();
  const { connector, page } = found;
  const today = todayIn("UTC", Date.now());
  const tiles = connectorShowcase(connector, catalog, today);
  const theme = catalog.defaultTheme();
  const others = catalog.connectors().filter((x) => x.id !== connector.id);

  return (
    <>
      <JsonLd
        data={breadcrumbLd(siteOrigin(), [
          { name: "Flexwall", path: "/" },
          { name: "Integrations", path: "/integrations" },
          { name: page.name, path: page.path },
        ])}
      />
      <div className="page">
        <TopBar signedIn={Boolean(await sessionUserId())} />
        <div className="page-head integration-head dotted">
          <p className="hint">
            <Link href="/integrations">Integrations</Link>
          </p>
          <h1 className="display">{page.headline}</h1>
          <p>{page.description}</p>
          <p className="tags">
            {page.verified ? <span className="badge quiet">Verified</span> : null}
            {page.pro ? <span className="badge">Pro</span> : null}
          </p>
        </div>

        <figure className="board" aria-label={`Example ${page.name} tiles`} style={{ margin: 0 }}>
          <figcaption className="board-head">
            <strong>{page.name} tiles</strong>
            <span>Sample numbers</span>
          </figcaption>
          <div className="board-body" style={wallStyle(theme)}>
            <WallGrids tiles={tiles} states={sampleStates(tiles, catalog)} theme={theme} today={today} catalog={catalog} />
          </div>
        </figure>
      </div>

      <div className="page">
        <main className="prose integration-body">
          <h2>What it measures</h2>
          <ul>
            {page.measures.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>: {m.kind.toLowerCase()}
                {m.description ? `. ${m.description}` : "."}
              </li>
            ))}
          </ul>

          <h2>What it needs</h2>
          {page.credentials ? (
            <>
              <p>
                {page.credentials.fields.join(", ")}. {page.credentials.help}
              </p>
              <p>Credentials are encrypted, used only to read these values, and never shown again. Remove the connection and they are deleted.</p>
            </>
          ) : (
            <p>Nothing to connect: {page.name} data is public. Type what to follow when you add the tile.</p>
          )}

          <h2>Tiles that can show it</h2>
          <p>{page.widgets.map((w) => w.name).join(", ")}. Every tile also appears on your share card and, if you like, on your iPhone lock screen.</p>

          <h2>Put it on your wall</h2>
          <p>Claim your handle, add a tile, pick {page.name}. Your wall lives at flexwall.lol/@you.</p>
          <p>
            <Link href="/login" className="btn btn-signal">
              Claim your wall
            </Link>
          </p>

          <h2>Other integrations</h2>
          <p>
            {others.map((o, i) => (
              <span key={o.id}>
                {i ? ", " : ""}
                <Link href={`/integrations/${o.id}`}>{o.name}</Link>
              </span>
            ))}
          </p>
        </main>
        <Footer />
      </div>
    </>
  );
}
