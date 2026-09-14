/**
 * Theme tokens. Widgets read colors and fonts from here, never hardcode them,
 * so one widget looks right on every theme, on the page and on images.
 * Every value must be Satori-safe: plain colors, linear/radial gradients.
 */

/** Fonts the host provides on every surface. */
export type FontFamily = "Grotesk" | "Inter" | "Serif" | "Mono";

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
  display: { family: FontFamily; weight: 400 | 500 | 700 | 800; letterSpacing?: number };
  body: { family: FontFamily; weight: 400 | 500 };
}

export function defineTheme(theme: Theme): Theme {
  return theme;
}
