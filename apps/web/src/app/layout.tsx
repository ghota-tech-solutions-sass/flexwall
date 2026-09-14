import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME } from "@/presentation/seo/structured-data";
import "./globals.css";

// One family, two voices: normal width for reading, the width axis at 125% for numbers and headlines.
const ui = Archivo({ subsets: ["latin"], variable: "--font-ui", axes: ["wdth"] });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Flexwall: your numbers, live, on one page", template: "%s | Flexwall" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { themeColor: "#f1f2f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
