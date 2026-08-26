import type { Metadata } from "next";

/** Public identity of the site, shared by metadata, sitemap and robots. */
export const SITE_NAME = "Flexwall";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://flexwall.lol").replace(/\/+$/, "");
export const SITE_TAGLINE = "The internet's most expensive leaderboard";
export const SITE_DESCRIPTION =
  "Pay more. Take the spot. Someone can always outbid you.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Flexwall — the internet's most expensive leaderboard." };
export const X_CREATOR = "@MickaelV79228";

/**
 * Métadonnées d'une page secondaire.
 *
 * Next fusionne `openGraph` et `twitter` par clé de premier niveau, pas en
 * profondeur : une page qui déclare son propre `openGraph` perd l'image, le
 * siteName et le locale du layout, et une page qui n'en déclare pas hérite du
 * titre de l'accueil. Résultat sans ce helper : /board partagé sur X affichait
 * la carte de l'accueil, sans image. Tout passe donc par ici.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  /** Titre affiché dans les cartes de partage, si différent de l'onglet. */
  shareTitle?: string;
}): Metadata {
  const shareTitle = opts.shareTitle ?? `${opts.title} · ${SITE_NAME}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: opts.path,
      title: shareTitle,
      description: opts.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: opts.description,
      images: [OG_IMAGE.url],
      creator: X_CREATOR,
    },
  };
}
