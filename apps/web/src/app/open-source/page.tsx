import Link from "next/link";
import { Footer, TopBar } from "@/components/site/Chrome";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";
import { pageMetadata } from "@/presentation/seo/metadata";
import { SOURCE_URL } from "@/site";

export const metadata = pageMetadata({
  title: "Open source · Build a connector",
  description: "Make your favorite service part of Flexwall. Explore the source, connect your own API, or build a custom connector with the open-source SDK.",
  path: ROUTES.openSource,
});

export default async function OpenSourcePage() {
  return (
    <div className="page">
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main id="main">
        <section className="page-head dotted source-hero">
          <span className="badge quiet">Built in the open</span>
          <h1 className="display">Your tools.<br />Your numbers. Your code.</h1>
          <p>Missing a connector? Make it part of Flexwall. The app, SDK and plugins are open source, and contributions are welcome.</p>
          <div className="source-actions">
            <a className="btn btn-signal" href={SOURCE_URL}>Explore the GitHub repo ↗</a>
            <a className="btn btn-quiet" href={`${SOURCE_URL}/blob/main/docs/plugins/connectors.md`}>Read the connector guide</a>
          </div>
        </section>
        <section className="section source-options" aria-label="Ways to connect">
          <article className="source-card">
            <span className="badge quiet">Already have an API?</span>
            <h2>Bring your own numbers</h2>
            <p>Use the Your API connector to read a value from a JSON endpoint you control. Choose the field to display and add it to your wall.</p>
            <Link className="link" href={ROUTES.integration("http")}>Discover Your API →</Link>
          </article>
          <article className="source-card">
            <span className="badge quiet">Build for everyone</span>
            <h2>Give a service its own connector</h2>
            <p>Define the metrics and how to fetch them. Flexwall handles the forms, encrypted credentials, caching and compatible widgets.</p>
            <a className="link" href={`${SOURCE_URL}/tree/main/templates/plugin`}>Explore the plugin template →</a>
          </article>
        </section>
        <section className="section source-start">
          <div>
            <h2 className="display">From an idea to a live tile.</h2>
            <ol className="source-steps">
              <li><strong>Fork the repo and create your plugin.</strong><p>Clone your fork, install Bun, then run these commands from the repository root.</p></li>
              <li><strong>Define your metrics and test real responses.</strong><p>Start with the <a href={`${SOURCE_URL}/tree/main/plugins/npm`}>npm connector</a>. Use read-only permissions and route requests through <code>ctx.fetch</code>.</p></li>
              <li><strong>Open a pull request.</strong><p>Include tests and a README covering setup and permissions. New connectors become available on flexwall.lol after review, merge and deployment. You can also use them on your own instance.</p></li>
            </ol>
          </div>
          <div className="source-code">
            <span>Terminal · inside your fork</span>
            <pre><code>{`bun install
bun run new-plugin my-service "My Service"
bun install
bun test plugins/my-service
bun run dev`}</code></pre>
            <a href={`${SOURCE_URL}/blob/main/docs/plugins/README.md`}>Full plugin development guide ↗</a>
          </div>
        </section>
        <section className="section">
          <div className="explore-invitation">
            <div><h2>More than connectors.</h2><p>Build widgets and themes too. The SDK and plugins use the MIT license; the Flexwall app uses AGPL-3.0.</p></div>
            <a className="btn btn-quiet" href={`${SOURCE_URL}/issues`}>Suggest an integration ↗</a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
