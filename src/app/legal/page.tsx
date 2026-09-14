import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/Chrome";

export const metadata: Metadata = { title: "Terms & privacy", alternates: { canonical: "/legal" } };

export default function LegalPage() {
  return (
    <div className="page">
      <TopBar />
      <main className="prose">
        <h1>Terms &amp; privacy</h1>

        <h2>What you get</h2>
        <p>
          Flexwall draws an image from the numbers you enter and serves it at a private link. Free wallpapers show a
          small flexwall.lol mark. Pro is a one-time payment of $4.99 for one wallpaper: every theme, no mark, and the
          option to appear in the gallery. It doesn&apos;t expire and there&apos;s no subscription.
        </p>

        <h2>Refunds</h2>
        <p>
          If Pro doesn&apos;t work on your phone, reply to your receipt email within 14 days and you get your money back.
        </p>

        <h2>What we store</h2>
        <ul>
          <li>Your wallpaper settings: the numbers, labels, dates and GitHub usernames you type.</li>
          <li>For Pro, the email Stripe collected at checkout, to send you your links. Card details never reach us.</li>
          <li>When a phone last fetched your image, so the editor can tell you the automation works.</li>
          <li>
            For connections: your Stripe restricted key, or your endpoint URL and header, encrypted with AES-256. They
            are used only to read the numbers on your wallpaper, and the last values read are kept to redraw it.
            Removing a connection deletes both.
          </li>
        </ul>
        <p>
          We only accept Stripe restricted keys, and ask for read access to Subscriptions and Balance. GitHub numbers
          come from public profiles. Nothing is shared or sold. Your wallpaper, and the numbers on it, are only public
          if you tick the gallery box.
        </p>

        <h2>Your links</h2>
        <p>
          There are no accounts. Whoever has your edit link can change your wallpaper, and whoever has your image link
          can see it. You can replace the image link from the editor at any time.
        </p>

        <h2>Contact</h2>
        <p>Reply to any email from us, or reach the maker on X.</p>
      </main>
      <Footer />
    </div>
  );
}
