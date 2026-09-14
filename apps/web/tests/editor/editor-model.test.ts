import { describe, expect, test } from "bun:test";
import {
  addTile,
  applyLayout,
  bindingFor,
  dataSignature,
  placeOnLockscreen,
  removeTile,
  setBinding,
  sourcesFor,
} from "@/components/editor/editor-model";
import { aTile, aWall } from "../builders";
import { testCatalog } from "../fakes/test-plugin";

const { catalog } = testCatalog();
const connections = [{ id: "c1", connector: "billing", label: "Billing", public: {}, createdAt: 0 }];

describe("Editor model", () => {
  test("given a wall with a full first row, when a stat is added, then it lands on the next free row with a typed number", () => {
    // Given
    const draft = aWall().with(aTile().withId("wide").note().at(0, 0, 2, 1)).with(aTile().withId("wide2").note().at(2, 0, 2, 1)).draft();

    // When
    const result = addTile(draft, "stat", catalog, connections)!;

    // Then
    const tile = result.draft.tiles.find((t) => t.id === result.tileId)!;
    expect(tile.layout).toEqual({ x: 0, y: 1, w: 2, h: 1 });
    expect(tile.inputs.value).toEqual({ kind: "static", value: { type: "number", value: 0 } });
  });

  test("given a number input that accepts series, when sources are listed, then metrics and their history are offered, history as Pro", () => {
    // Given
    const input = { key: "value", label: "Number", accepts: ["number", "series"] as ("number" | "series")[] };

    // When
    const sources = sourcesFor(input, catalog);

    // Then
    expect(sources.map((s) => s.value)).toContain("metric:analytics:visitors");
    expect(sources.find((s) => s.value === "history:analytics:visitors:30d")?.pro).toBe(true);
    expect(sources.find((s) => s.value === "metric:billing:mrr")?.pro).toBe(true);
  });

  test("given a connected account, when its connector's metric is picked, then the binding uses that connection", () => {
    // Given
    const source = "metric:billing:mrr";

    // When
    const binding = bindingFor(source, catalog, connections);

    // Then
    expect(binding).toEqual({ kind: "metric", connector: "billing", metric: "mrr", params: {}, connection: "c1", history: null });
  });

  test("given a new stat without a label, when a metric is picked, then it takes the metric's label", () => {
    // Given
    const draft = aWall().with(aTile().withId("s").widget("stat", {})).draft();

    // When
    const next = setBinding(draft, "s", "value", bindingFor("metric:billing:mrr", catalog, connections), catalog);

    // Then
    expect(next.tiles[0].options.label).toBe("Monthly revenue");
  });

  test("given a tile labelled with a metric's default, when the metric changes, then the label follows; a custom label stays", () => {
    // Given
    const draft = aWall().with(aTile().withId("s").stat({ label: "" })).draft();
    const withVisitors = setBinding(draft, "s", "value", bindingFor("metric:analytics:visitors", catalog, connections), catalog);

    // When
    const custom = setBinding({ ...withVisitors, tiles: withVisitors.tiles.map((t) => ({ ...t, options: { ...t.options, label: "Mine" } })) }, "s", "value", bindingFor("metric:billing:mrr", catalog, connections), catalog);

    // Then
    expect(custom.tiles[0].options.label).toBe("Mine");
    expect(custom.tiles[0].inputs.value).toMatchObject({ connector: "billing" });
  });

  test("given a tile on the lock screen, when it's removed from the wall, then its placement goes too", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").note()).onLockscreen("a", { x: 0, y: 0, w: 2, h: 1 }).draft();

    // When
    const next = removeTile(draft, "a");

    // Then
    expect(next.lockscreen.placements).toEqual([]);
  });

  test("given a full lock screen, when another tile is placed, then the owner is told why", () => {
    // Given
    const draft = aWall().with(aTile().withId("new").note().at(0, 5, 4, 1)).draft();
    for (let y = 0; y < 4; y++) draft.lockscreen.placements.push({ tileId: `full${y}`, box: { x: 0, y, w: 4, h: 1 } });

    // When
    const result = placeOnLockscreen(draft, "new", catalog);

    // Then
    expect(result).toEqual({ error: "The lock screen is full. Remove a tile or make one smaller." });
  });

  test("given a layout change, when only positions move, then the data signature is unchanged and no refetch is needed", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").stat().metric("analytics", "visitors", { params: { site: "x" } })).draft();

    // When
    const moved = applyLayout(draft, [{ i: "a", x: 2, y: 3, w: 2, h: 1 }]);

    // Then
    expect(moved.tiles[0].layout).toEqual({ x: 2, y: 3, w: 2, h: 1 });
    expect(dataSignature(moved)).toBe(dataSignature(draft));
    expect(applyLayout(moved, [{ i: "a", x: 2, y: 3, w: 2, h: 1 }])).toBe(moved);
  });
});
