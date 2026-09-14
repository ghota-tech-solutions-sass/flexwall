import { describe, expect, test } from "bun:test";
import { checkPlugins } from "@flexwall/sdk";
import { bindingFor, sourcesFor } from "@/application/editor/draft";
import { entitlementsOf } from "@/domain/user";
import { applyDraft } from "@/domain/wall";
import { catalog, PLUGINS } from "@/plugins/registry";
import { aTile, aUser, aWall, NOW } from "../builders";

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

describe("Every connector metric, as a tile", () => {
  const owner = { id: "u1", handle: "ada" };
  const connections = catalog
    .connectors()
    .filter((c) => c.auth)
    .map((c) => ({ id: `conn-${c.id}`, ownerId: owner.id, connector: c.id, label: c.name, public: {}, sealed: "sealed", accountId: null, createdAt: 0 }));

  for (const connector of catalog.connectors()) {
    for (const metric of connector.metrics) {
      test(`given ${connector.id} ${metric.id}, when a tile is built from it in the editor, then the wall accepts it`, () => {
        // Given: a core widget whose input takes this metric, params filled from their placeholders
        const widget = catalog.widgets().find((w) => w.inputs.some((i) => i.accepts.includes(metric.type)));
        expect(widget).toBeDefined();
        const input = widget!.inputs.find((i) => i.accepts.includes(metric.type))!;
        const source = sourcesFor(input, catalog).find((s) => s.ref.kind === "metric" && s.ref.connector === connector.id && s.ref.metric === metric.id);
        expect(source).toBeDefined();

        // When
        const binding = bindingFor(source!.ref, catalog, connections.map((c) => ({ id: c.id, connector: c.connector, label: c.label, public: {}, createdAt: 0 })))!;
        if (binding.kind === "metric") {
          for (const f of metric.params ?? []) {
            binding.params[f.key] = f.kind === "select" ? (f.default ?? f.options[0]!.value) : "placeholder" in f && f.placeholder ? f.placeholder : "example";
          }
        }
        const [w, h] = widget!.size.default;
        const draft = aWall().with(aTile().withId("t").widget(widget!.id, {}).input(input.key, binding).at(0, 0, w, h)).draft();
        const saved = () => applyDraft(aWall().build(), draft, { catalog, entitlements: entitlementsOf(aUser().pro().build(), NOW), connections }, NOW);

        // Then: placeholders are valid examples, and the domain vouches for the tile
        expect(saved).not.toThrow();
      });
    }
  }
});
