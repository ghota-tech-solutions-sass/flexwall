import type { CSSProperties } from "react";
import type { Theme } from "@flexwall/sdk";

/**
 * A theme exposed to a stylesheet as CSS custom properties. Each stylesheet
 * reads its own names; the names live here, next to the theme value each one
 * carries, so a rename can't leave a stylesheet reading nothing.
 */

export type CssVariable = `--${string}`;

/** What a page's chrome can take from a theme, by the role the color plays. */
const ROLES = {
  ink: (t) => t.ink,
  muted: (t) => t.muted,
  tile: (t) => t.tile,
  tileBorder: (t) => t.tileBorder,
  positive: (t) => t.positive,
  // A theme's page is a flat color by contract: readable on ink, and a solid ground for menus over translucent tiles.
  page: (t) => t.page,
  onInk: (t) => t.page,
  solid: (t) => t.page,
} satisfies Record<string, (theme: Theme) => string>;

export type ThemeRole = keyof typeof ROLES;

export type ThemeVariables = Partial<Record<ThemeRole, CssVariable>>;

/** Read by wall-page.css and the profile avatar in globals.css. */
export const WALL_VARIABLES = {
  ink: "--wall-ink",
  muted: "--wall-muted",
  tile: "--wall-tile",
  tileBorder: "--wall-border",
  positive: "--wall-positive",
  page: "--wall-page",
  onInk: "--wall-on-ink",
  solid: "--wall-solid",
} as const satisfies ThemeVariables;

/** Read by the Explore wall cards in globals.css. */
export const CARD_VARIABLES = {
  tile: "--card-tile",
  tileBorder: "--card-tile-border",
  muted: "--card-muted",
  positive: "--card-positive",
} as const satisfies ThemeVariables;

/** The site tokens the Flexwall logo paints its small tiles with, pointed at a theme instead. */
export const LOGO_VARIABLES = {
  tile: "--bg",
  muted: "--muted",
} as const satisfies ThemeVariables;

/** Style properties that set `variables` to the theme's colors. */
export function themeVariables(theme: Theme, variables: ThemeVariables): CSSProperties {
  const style: Record<CssVariable, string> = {};
  for (const [role, name] of Object.entries(variables) as [ThemeRole, CssVariable][]) style[name] = ROLES[role](theme);
  return style as CSSProperties;
}
