import { describe, expect, test } from "bun:test";
import { firstOverlap, fitsColumns, WALL_COLUMNS } from "@/domain/layout";
import { applyTemplate, TEMPLATES, templateById } from "@/domain/templates";
import { applyDraft } from "@/domain/wall";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { aUser, aWall, NOW } from "../builders";
import { SequentialIds } from "../fakes";
import { catalog } from "@/plugins/registry";
import { entitlementsOf } from "@/domain/user";

const ids = () => {
  const gen = new SequentialIds();
  return () => gen.next();
};

describe("Walls to start from", () => {
  test("given every template, when its tiles are read, then each one fits the grid and the widget that draws it", () => {
    // Given / When
    const problems = TEMPLATES.flatMap((template) =>
      template.tiles.flatMap((tile) => {
        const widget = catalog.widget(tile.widget);
        if (!widget) return [`${template.id}: no widget "${tile.widget}"`];
        const [minW, minH] = widget.size.min;
        const [maxW, maxH] = widget.size.max;
        const fits = fitsColumns(tile.layout, WALL_COLUMNS) && tile.layout.w >= minW && tile.layout.w <= maxW && tile.layout.h >= minH && tile.layout.h <= maxH;
        return fits ? [] : [`${template.id}: ${tile.widget} at ${JSON.stringify(tile.layout)}`];
      })
    );

    // Then
    expect(problems).toEqual([]);
  });

  test("given every template, when its tiles are laid out, then none of them overlap", () => {
    // Given / When
    const overlapping = TEMPLATES.filter((t) => firstOverlap(t.tiles.map((tile) => tile.layout)) !== null).map((t) => t.id);

    // Then
    expect(overlapping).toEqual([]);
  });

  test("given every template, when applied to a wall, then what comes out is a wall the server accepts", () => {
    // Given
    const draft = aWall().draft();

    // When
    const applied = TEMPLATES.map((template) => applyTemplate({ ...draft }, template, ids(), FREE_TILE_LIMIT));

    // Then: the server's own rules, the ones the autosave runs into a second later
    const rules = { catalog, entitlements: entitlementsOf(aUser().pro().build(), NOW), connections: [] };
    for (const [index, wall] of applied.entries()) {
      const saved = applyDraft(aWall().build(), wall, rules, NOW);
      expect(saved.tiles).toHaveLength(TEMPLATES[index].tiles.length);
    }
  });

  test("given a plan that allows fewer tiles than the template has, when it's applied, then only what fits arrives", () => {
    // Given
    const template = TEMPLATES.find((t) => t.tiles.length > 2)!;

    // When
    const applied = applyTemplate(aWall().draft(), template, ids(), 2);

    // Then
    expect(applied.tiles).toHaveLength(2);
  });

  test("given a wall with a lock screen, when a template replaces it, then no placement points at a tile that's gone", () => {
    // Given
    const draft = aWall().draft();

    // When
    const applied = applyTemplate(draft, TEMPLATES[0], ids(), FREE_TILE_LIMIT);

    // Then
    expect(applied.lockscreen.placements).toEqual([]);
  });

  test("given an id that no template has, when it's looked up, then nothing comes back", () => {
    // Given / When / Then
    expect(templateById("nope")).toBeNull();
    expect(templateById(TEMPLATES[0].id)?.name).toBe(TEMPLATES[0].name);
  });
});
