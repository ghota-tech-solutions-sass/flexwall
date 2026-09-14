import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME } from "@/presentation/seo/structured-data";
import { LOCAL_APP_URL } from "@/site";
import "./globals.css";

const ui = Geist({ subsets: ["latin"], variable: "--font-ui" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || LOCAL_APP_URL;

/** Browser chrome color in each scheme: the page background, --bg in globals.css. */
const THEME_COLORS = { light: "#ffffff", dark: "#09090b" } as const;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Flexwall: your numbers, live, on one page", template: "%s | Flexwall" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
