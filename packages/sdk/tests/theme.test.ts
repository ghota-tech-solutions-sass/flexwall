import { describe, expect, test } from "bun:test";
import { checkPlugins, definePlugin } from "../src/plugin";
import { themeBackground, themeProblems, type Theme } from "../src/theme";

const aTheme = (over: Partial<Theme> = {}): Theme => ({
  id: "t",
  name: "T",
  tier: "free",
  mode: "light",
  page: "#ffffff",
  tile: "#ffffff",
  tileBorder: "rgba(0,0,0,0.1)",
  ink: "#000000",
  muted: "#666666",
  accent: "#00aa55",
  positive: "#00aa55",
  negative: "#dd3333",
  track: "rgba(0,0,0,0.06)",
  heat: ["#eeeeee", "#cceecc", "#88dd99", "#44bb66", "#119944"],
  radius: 14,
  display: { family: "Geist", weight: 700 },
  body: { family: "Geist", weight: 400 },
  ...over,
});

describe("Theme contract", () => {
  test("given a theme whose page is a gradient, when checked, then the owner is told to move it to the wallpaper", () => {
    // Given: what a plugin without the SDK types can still ship
    const theme = aTheme({ page: "linear-gradient(160deg, #ff7a3d, #5a2dff)" as Theme["page"] });

    // When
    const problems = themeProblems(theme);

    // Then
    expect(problems).toEqual(['page must be one flat color (hex, rgb or hsl), got "linear-gradient(160deg, #ff7a3d, #5a2dff)": move gradients to wallpaper']);
  });

  test("given a plugin with a broken theme, when plugins are checked at startup, then it's refused", () => {
    // Given
    const plugin = definePlugin({ id: "p", name: "P", description: "", author: { name: "a" }, themes: [aTheme({ wallpaper: "#ff0000" as Theme["wallpaper"] })] });

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual(['plugin p, theme t: wallpaper must be linear-gradient or radial-gradient layers, got "#ff0000"']);
  });

  test("given a theme with and without a wallpaper, when its ground is painted, then the color is always set and the gradient layers over it", () => {
    // Given
    const plain = aTheme();
    const papered = aTheme({ page: "#0a1510", wallpaper: "radial-gradient(circle, #173026, #0a1510)" });

    // When
    const grounds = [themeBackground(plain), themeBackground(papered)];

    // Then
    expect(grounds).toEqual([{ backgroundColor: "#ffffff" }, { backgroundColor: "#0a1510", backgroundImage: "radial-gradient(circle, #173026, #0a1510)" }]);
  });
});
