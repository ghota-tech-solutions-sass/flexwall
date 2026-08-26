/**
 * Palette de marque, en dur.
 *
 * Les surfaces d'image — carte Open Graph, carte de partage en canvas, image
 * statique de l'accueil — sont rendues hors CSS et ne peuvent pas lire les
 * custom properties de `globals.css`. Elles copiaient donc les couleurs à la
 * main et ont fini par diverger : les cartes sont restées sur les gris bleutés
 * d'origine pendant que le site passait aux gris neutres. Ces constantes sont
 * le miroir des tokens `:root` ; changer l'un impose de changer l'autre.
 */
export const BRAND = {
  bg: "#000000",
  card: "#0b0b0d",
  ink: "#ececec",
  muted: "#8f8f98",
  faint: "#63636b",
  line: "#1e1e22",
  line2: "#2c2c31",
  gold: "#e2b340",
  goldBright: "#f2c75c",
} as const;

/** Pile monospace utilisée par les cartes rendues côté serveur et en canvas. */
export const BRAND_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
