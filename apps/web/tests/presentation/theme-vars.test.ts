import { describe, expect, test } from "bun:test";
import { catalog } from "@/plugins/registry";
import { CARD_VARIABLES, LOGO_VARIABLES, themeVariables, WALL_VARIABLES } from "@/presentation/theme-vars";

describe("Theme CSS variables", () => {
  test("given a theme, when exposed to the wall page, then each name carries the color of its role", () => {
    // Given
    const theme = catalog.defaultTheme();

    // When
    const style = themeVariables(theme, WALL_VARIABLES) as Record<string, string>;

    // Then
    expect(style).toEqual({
      "--wall-ink": theme.ink,
      "--wall-muted": theme.muted,
      "--wall-tile": theme.tile,
      "--wall-border": theme.tileBorder,
      "--wall-positive": theme.positive,
      "--wall-page": theme.page,
      "--wall-on-ink": theme.page,
      "--wall-solid": theme.page,
    });
  });

  test("given a stylesheet that reads only a few names, when a theme is exposed to it, then nothing else is set", () => {
    // Given
    const theme = catalog.defaultTheme();

    // When
    const card = themeVariables(theme, CARD_VARIABLES);
    const logo = themeVariables(theme, LOGO_VARIABLES);

    // Then
    expect(Object.keys(card)).toEqual(["--card-tile", "--card-tile-border", "--card-muted", "--card-positive"]);
    expect(logo).toEqual({ "--bg": theme.tile, "--muted": theme.muted } as never);
  });
});
