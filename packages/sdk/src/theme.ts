import type { Tier } from "./tier";

/**
 * Theme tokens. Widgets read colors and fonts from here, never hardcode them,
 * so one widget looks right on every theme, on the page and on images.
 * Every value must be Satori-safe: plain colors, linear/radial gradients.
 */

/** Fonts the host provides on every surface. */
export type FontFamily = "Grotesk" | "Inter" | "Serif" | "Mono" | "Archivo" | "Archivo Wide" | "Geist";

/**
 * One flat color. Hosts put it where CSS and Satori only take a color
 * (`background-color`, text, borders), so a gradient here would be dropped.
 */
export type Color = `#${string}` | `rgb(${string})` | `rgba(${string})` | `hsl(${string})` | `hsla(${string})`;

/** One or more gradient layers, comma separated, the first one starting the value. */
export type Gradient = `linear-gradient(${string})` | `radial-gradient(${string})`;

export interface Theme {
  id: string;
  name: string;
  tier: Tier;
  /** Tells the host which way to tint chrome drawn around tiles (and the iOS clock). */
  mode: "dark" | "light";
  /** Solid ground behind the whole wall. Also the color of text drawn on `ink`. */
  page: Color;
  /** Optional gradients drawn over `page`, like a phone wallpaper. Pages and images both draw it. */
  wallpaper?: Gradient;
  /** Tile background and border. */
  tile: Color;
  tileBorder: Color;
  /** Optional box-shadow for tiles. Keep it soft: it is drawn on images too. */
  tileShadow?: string;
  ink: Color;
  muted: Color;
  accent: Color;
  positive: Color;
  negative: Color;
  /** Empty part of bars and tracks. */
  track: Color;
  /** Heatmap levels 0 to 4. */
  heat: [Color, Color, Color, Color, Color];
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
  Geist: 0.62,
};

/**
 * How wide running text runs, in em. Letters and spaces average narrower than
 * figures, except in a monospace face where every glyph is as wide as a digit.
 */
export const TEXT_ADVANCE: Record<FontFamily, number> = {
  Grotesk: 0.52,
  Inter: 0.52,
  Serif: 0.52,
  Mono: 0.61,
  Archivo: 0.52,
  "Archivo Wide": 0.68,
  Geist: 0.56,
};

/** The em advance to fit a title set in the display font. */
export function titleAdvance(theme: Pick<Theme, "display">): number {
  return TEXT_ADVANCE[theme.display.family];
}

/** The em advance to fit a caption set in the body font. */
export function bodyAdvance(theme: Pick<Theme, "body">): number {
  return TEXT_ADVANCE[theme.body.family];
}

/** The em advance to fit display figures with: the theme's own, or its font's. */
export function displayAdvance(theme: Pick<Theme, "display">): number {
  return theme.display.advance ?? FONT_ADVANCE[theme.display.family];
}

export function defineTheme(theme: Theme): Theme {
  return theme;
}

/** The ground of a theme as style properties. Every surface paints a theme through this, so none can forget the wallpaper. */
export function themeBackground(theme: Pick<Theme, "page" | "wallpaper">): { backgroundColor: Color; backgroundImage?: Gradient } {
  return theme.wallpaper ? { backgroundColor: theme.page, backgroundImage: theme.wallpaper } : { backgroundColor: theme.page };
}

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([^()]*\))$/i;
const GRADIENT = /^(linear|radial)-gradient\(/i;

const COLOR_KEYS = ["page", "tile", "tileBorder", "ink", "muted", "accent", "positive", "negative", "track"] as const satisfies readonly (keyof Theme)[];

/**
 * What the types promise, checked at runtime for plugins built without them:
 * colors where hosts need a color, gradients only in the wallpaper.
 */
export function themeProblems(theme: Theme): string[] {
  const problems: string[] = [];
  const check = (name: string, value: string) => {
    if (COLOR.test(value.trim())) return;
    problems.push(`${name} must be one flat color (hex, rgb or hsl), got "${value}"${GRADIENT.test(value.trim()) ? ": move gradients to wallpaper" : ""}`);
  };
  for (const key of COLOR_KEYS) check(key, theme[key]);
  theme.heat.forEach((value, level) => check(`heat[${level}]`, value));
  if (theme.wallpaper !== undefined && !GRADIENT.test(theme.wallpaper.trim())) problems.push(`wallpaper must be linear-gradient or radial-gradient layers, got "${theme.wallpaper}"`);
  return problems;
}
