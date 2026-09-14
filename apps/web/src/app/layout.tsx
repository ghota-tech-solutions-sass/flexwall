import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// One family, two voices: normal width for reading, the width axis at 125% for numbers and headlines.
const ui = Archivo({ subsets: ["latin"], variable: "--font-ui", axes: ["wdth"] });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Flexwall: your numbers, live, on one page", template: "%s · Flexwall" },
  description: "A public page of live tiles fed by your real accounts: Stripe MRR, GitHub streaks, and anything with an API. Share it, pin it to your lock screen.",
  applicationName: "Flexwall",
  openGraph: { type: "website", siteName: "Flexwall" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#f1f2f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
