import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopBar } from "@/components/site/Chrome";
import { ROUTES } from "@/presentation/routes";

// Next already marks not-found responses noindex.
export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="page">
      <TopBar signedIn={false} />
      <main className="prose" style={{ marginBlock: "48px" }}>
        <h1>Nothing here.</h1>
        <p>This page doesn&apos;t exist, or the wall isn&apos;t published. Check the handle, or look around:</p>
        <ul>
          <li>
            <Link href={ROUTES.explore}>The Wall</Link>: builders who show their real numbers
          </li>
          <li>
            <Link href={ROUTES.integrations}>Integrations</Link>: every service a tile can read from
          </li>
          <li>
            <Link href={ROUTES.login}>Claim your handle</Link> and build your own wall
          </li>
        </ul>
      </main>
      <Footer />
    </div>
  );
}
