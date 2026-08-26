/** Public identity of the site, shared by metadata, sitemap and robots. */
export const SITE_NAME = "Flexwall";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://flexwall.lol").replace(/\/+$/, "");
export const SITE_TAGLINE = "The internet's most expensive leaderboard";
export const SITE_DESCRIPTION =
  "Pay more. Take the spot. Someone can always outbid you.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Flexwall — the internet's most expensive leaderboard." };
