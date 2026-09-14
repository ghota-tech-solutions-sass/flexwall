import { describe, expect, test } from "bun:test";
import { checkPlugins } from "@flexwall/sdk";
import { catalog, PLUGINS } from "@/plugins/registry";

describe("Installed plugins", () => {
  test("given every installed plugin, when checked together, then ids are unique and definitions are sound", () => {
    // Given
    const plugins = PLUGINS;

    // When
    const problems = checkPlugins(plugins);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the catalog, when a wall is built, then its default theme and core widgets exist", () => {
    // Given / When
    const theme = catalog.defaultTheme();

    // Then
    expect(theme.tier).toBe("free");
    for (const id of ["stat", "sparkline", "heatmap", "countdown", "time-left", "note", "link"]) expect(catalog.widget(id)).not.toBeNull();
  });
});
