import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${SITE_NAME}: ${SITE_TAGLINE}`, description: SITE_DESCRIPTION },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0e1330" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
