/**
 * Theme tokens. Widgets read colors and fonts from here, never hardcode them,
 * so one widget looks right on every theme, on the page and on images.
 * Every value must be Satori-safe: plain colors, linear/radial gradients.
 */

/** Fonts the host provides on every surface. */
export type FontFamily = "Grotesk" | "Inter" | "Serif" | "Mono" | "Archivo" | "Archivo Wide";

export interface Theme {
  id: string;
  name: string;
  tier: "free" | "pro";
  /** Tells the host which way to tint chrome drawn around tiles (and the iOS clock). */
  mode: "dark" | "light";
  /** Behind the whole wall. */
  page: string;
  /** Tile background and border. */
  tile: string;
  tileBorder: string;
  ink: string;
  muted: string;
  accent: string;
  positive: string;
  negative: string;
  /** Empty part of bars and tracks. */
  track: string;
  /** Heatmap levels 0 to 4. */
  heat: [string, string, string, string, string];
  /** Corner radius of tiles, in units (a hundredth of a grid cell). */
  radius: number;
  /** `advance` overrides the average figure width in em when a theme tracks its display font tighter or looser. */
  display: { family: FontFamily; weight: 400 | 500 | 700 | 800; letterSpacing?: number; advance?: number };
  body: { family: FontFamily; weight: 400 | 500 };
}

/**
 * How wide the display font's figures run, in em. Widgets size numbers to fit
 * their tile from it: a wide face needs a smaller size for the same width.
 */
export const FONT_ADVANCE: Record<FontFamily, number> = {
  Grotesk: 0.56,
  Inter: 0.56,
  Serif: 0.56,
  Mono: 0.62,
  Archivo: 0.56,
  "Archivo Wide": 0.76,
};

/** The em advance to fit display text with: the theme's own, or its font's. */
export function displayAdvance(theme: Pick<Theme, "display">): number {
  return theme.display.advance ?? FONT_ADVANCE[theme.display.family];
}

export function defineTheme(theme: Theme): Theme {
  return theme;
}
