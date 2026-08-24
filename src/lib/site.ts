/** Public identity of the site, shared by metadata, sitemap and robots. */
export const SITE_NAME = "flexwall.lol";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://flexwall.lol").replace(/\/+$/, "");
export const SITE_TAGLINE = "Money, ranked.";
export const SITE_DESCRIPTION =
  "A public wall that ranks money. Post an amount, take your rank, defend it. Every entry is public, permanent and paid.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "flexwall.lol: money, ranked." };
