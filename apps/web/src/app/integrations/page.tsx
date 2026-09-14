import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer, TopBar } from "@/components/site/Chrome";
import { catalog } from "@/plugins/registry";
import { sessionUserId } from "@/presentation/http";
import { integrationPage } from "@/presentation/seo/integrations";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { breadcrumbLd, itemListLd } from "@/presentation/seo/structured-data";

export const metadata: Metadata = pageMetadata({
  title: "Integrations",
  description: "Every service a Flexwall tile can read from: Stripe, GitHub, Lemon Squeezy, Polar, Plausible, npm, YouTube and more, live on a public page and your lock screen.",
  path: "/integrations",
});

export default async function IntegrationsPage() {
  const pages = catalog.connectors().map((connector) => integrationPage(connector, catalog.widgets()));
  const verified = pages.filter((p) => p.verified);
  const open = pages.filter((p) => !p.verified);

  return (
    <div className="page">
      <JsonLd
        data={[
          breadcrumbLd(siteOrigin(), [
            { name: "Flexwall", path: "/" },
            { name: "Integrations", path: "/integrations" },
          ]),
          itemListLd(siteOrigin(), "Flexwall integrations", pages.map((p) => ({ name: p.name, path: p.path }))),
        ]}
      />
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main>
        <div className="page-head dotted">
          <h1 className="display">Integrations</h1>
          <p>Tiles read their numbers from the services that produce them and redraw on their own. Values from your own accounts carry a verified badge.</p>
        </div>
        {[
          { title: "From your own accounts", hint: "You connect them once with a read-only key. Numbers are verified.", items: verified },
          { title: "From public data", hint: "Nothing to connect: type a username, a package or a URL.", items: open },
        ].map((group) =>
          group.items.length ? (
            <section key={group.title} className="section">
              <div className="section-head">
                <h2 className="display">{group.title}</h2>
                <p>{group.hint}</p>
              </div>
              <ul className="connector-list">
                {group.items.map((p) => (
                  <li key={p.id}>
                    <h3>
                      <Link href={p.path}>{p.name}</Link>
                    </h3>
                    <p>{p.measures.map((m) => m.name).join(", ")}</p>
                    <span className="tags">
                      {p.verified ? <span className="badge quiet">Verified</span> : null}
                      {p.pro ? <span className="badge">Pro</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )}
      </main>
      <Footer />
    </div>
  );
}
