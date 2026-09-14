import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/site/Chrome";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Terms & privacy", alternates: { canonical: "/legal" } };

export default async function LegalPage() {
  return (
    <div className="page">
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main className="prose">
        <h1>Terms &amp; privacy</h1>
        <h2>The service</h2>
        <p>Flexwall shows tiles you arrange, fed by values you type or read from accounts you connect. Your wall is public only when you publish it, and each tile is public only if you mark it so.</p>
        <h2>Plans and refunds</h2>
        <p>Pro is billed monthly or yearly through Stripe and can be cancelled any time from Settings; it runs to the end of the paid period. Lifetime is a one-time payment. If Pro doesn&apos;t work for you, write within 14 days of paying for a refund.</p>
        <h2>What we store</h2>
        <ul>
          <li>Your email, handle, time zone and wall.</li>
          <li>For connections: the credentials you enter, encrypted with AES-256, used only to read the values on your tiles.</li>
          <li>The last values read and one reading a day per number, for history charts.</li>
          <li>Your Stripe customer and subscription status. Card details never reach us.</li>
        </ul>
        <p>We only accept read-only credentials where a provider offers them. Removing a connection deletes its credentials. Nothing is sold or shared.</p>
        <h2>Verified numbers</h2>
        <p>The verified badge means a value was read from the owner&apos;s own connected account at the time shown. Faking verification, impersonating someone or posting harmful content gets a wall removed. Report walls from the link at their bottom.</p>
        <h2>Open source</h2>
        <p>The code that stores your credentials is public: the app is AGPL-3.0, the SDK and plugins are MIT.</p>
      </main>
      <Footer />
    </div>
  );
}
