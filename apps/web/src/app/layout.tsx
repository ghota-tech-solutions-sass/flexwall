import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const ui = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-ui" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Flexwall: your numbers, live, on one page", template: "%s · Flexwall" },
  description: "A public page of live tiles fed by your real accounts: Stripe MRR, GitHub streaks, and anything with an API. Share it, pin it to your lock screen.",
  applicationName: "Flexwall",
  openGraph: { type: "website", siteName: "Flexwall" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0d0f1f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
