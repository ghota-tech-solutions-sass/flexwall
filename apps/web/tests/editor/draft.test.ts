import { describe, expect, test } from "bun:test";
import {
  addTile,
  applyLayout,
  dropCell,
  applyLockscreenLayout,
  attachConnection,
  bindingFor,
  dataSignature,
  detachConnection,
  duplicateTile,
  placeOnLockscreen,
  removeTile,
  restoreTile,
  setBinding,
  sourcesFor,
  tileConnections,
  tilesUsing,
} from "@/application/editor/draft";
import { aTile, aWall } from "../builders";
import { testCatalog } from "../fakes/test-plugin";
import { applyPhoneLayout } from "@/application/editor/draft";
import { readingOrder, WALL_COLUMNS } from "@/domain/layout";

const { catalog } = testCatalog();
const connections = [{ id: "c1", connector: "billing", label: "Billing", public: {}, createdAt: 0 }];

describe("Editor model", () => {
  test("given a cell the owner dropped a widget on, when the tile is added, then it lands there, kept inside the columns", () => {
    // Given
    const draft = aWall().draft();

    // When
    const inside = addTile(draft, "stat", catalog, connections, () => "a", { x: 1, y: 3 })!;
    const overflowing = addTile(draft, "stat", catalog, connections, () => "b", { x: 3, y: -2 })!;

    // Then
    expect(inside.draft.tiles.at(-1)!.layout).toEqual({ x: 1, y: 3, w: 2, h: 1 });
    expect(overflowing.draft.tiles.at(-1)!.layout).toEqual({ x: 2, y: 0, w: 2, h: 1 });
  });

  test("given points on the wall grid, when turned into drop cells, then they snap to the cell under them and stay inside the columns", () => {
    // Given
    const grid = { cell: 100, gap: 12, columns: 4 };

    // When / Then
    expect(dropCell({ x: 10, y: 10 }, grid, 1)).toEqual({ x: 0, y: 0 });
    expect(dropCell({ x: 230, y: 120 }, grid, 1)).toEqual({ x: 2, y: 1 });
    expect(dropCell({ x: 440, y: 5 }, grid, 2)).toEqual({ x: 2, y: 0 });
    expect(dropCell({ x: -40, y: -40 }, grid, 2)).toEqual({ x: 0, y: 0 });
  });

  test("given a wall with a full first row, when a stat is added, then it lands on the next free row with a typed number", () => {
    // Given
    const draft = aWall().with(aTile().withId("wide").note().at(0, 0, 2, 1)).with(aTile().withId("wide2").note().at(2, 0, 2, 1)).draft();

    // When
    const result = addTile(draft, "stat", catalog, connections, () => "new")!;

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
    expect(sources.map((s) => s.key)).toContain("metric:analytics:visitors");
    expect(sources.find((s) => s.key === "history:analytics:visitors:30d")?.pro).toBe(true);
    expect(sources.find((s) => s.key === "metric:billing:mrr")?.pro).toBe(true);
  });

  test("given a connected account, when its connector's metric is picked, then the binding uses that connection", () => {
    // Given
    const source = { kind: "metric", connector: "billing", metric: "mrr" } as const;

    // When
    const binding = bindingFor(source, catalog, connections);

    // Then
    expect(binding).toEqual({ kind: "metric", connector: "billing", metric: "mrr", params: {}, connection: "c1", history: null });
  });

  test("given a new stat without a label, when a metric is picked, then it takes the metric's label", () => {
    // Given
    const draft = aWall().with(aTile().withId("s").widget("stat", {})).draft();

    // When
    const next = setBinding(draft, "s", "value", bindingFor({ kind: "metric", connector: "billing", metric: "mrr" }, catalog, connections), catalog);

    // Then
    expect(next.tiles[0].options.label).toBe("Monthly revenue");
  });

  test("given a tile labelled with a metric's default, when the metric changes, then the label follows; a custom label stays", () => {
    // Given
    const draft = aWall().with(aTile().withId("s").stat({ label: "" })).draft();
    const withVisitors = setBinding(draft, "s", "value", bindingFor({ kind: "metric", connector: "analytics", metric: "visitors" }, catalog, connections), catalog);

    // When
    const custom = setBinding({ ...withVisitors, tiles: withVisitors.tiles.map((t) => ({ ...t, options: { ...t.options, label: "Mine" } })) }, "s", "value", bindingFor({ kind: "metric", connector: "billing", metric: "mrr" }, catalog, connections), catalog);

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

  test("given tiles waiting for a billing account, when one is connected from the editor, then they use it and other bindings stay", () => {
    // Given
    const draft = aWall()
      .with(aTile().withId("waiting").stat().metric("billing", "mrr", { connection: null }))
      .with(aTile().withId("bound").stat().metric("billing", "mrr", { connection: "c1" }))
      .with(aTile().withId("other").stat().metric("analytics", "visitors", { params: { site: "x" } }))
      .draft();
    const fresh = { id: "c2", connector: "billing", label: "Second", public: {}, createdAt: 1 };

    // When
    const next = attachConnection(draft, fresh, connections);

    // Then
    expect(next.tiles.map((t) => (t.inputs.value as { connection: string | null }).connection)).toEqual(["c2", "c1", null]);
    expect(dataSignature(next)).not.toBe(dataSignature(draft));
  });

  test("given two billing accounts, when the one a tile uses is removed, then the tile falls back to the other", () => {
    // Given
    const second = { id: "c2", connector: "billing", label: "Second", public: {}, createdAt: 1 };
    const draft = aWall().with(aTile().withId("a").stat().metric("billing", "mrr", { connection: "c2" })).draft();

    // When
    const next = detachConnection(draft, second, connections);
    const orphan = detachConnection(next, connections[0], []);

    // Then
    expect(next.tiles[0].inputs.value).toMatchObject({ connection: "c1" });
    expect(orphan.tiles[0].inputs.value).toMatchObject({ connection: null });
  });

  test("given a removed tile, when it's duplicated or restored, then it lands in a free spot with the same settings", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").note().at(0, 0, 2, 1)).draft();

    // When
    const copy = duplicateTile(draft, "a", () => "copy")!;
    const removed = removeTile(copy.draft, "a");
    const restored = restoreTile(removed, draft.tiles[0]);

    // Then
    expect(copy.draft.tiles[1]).toMatchObject({ widget: "note", layout: { x: 2, y: 0, w: 2, h: 1 } });
    expect(copy.tileId).not.toBe("a");
    expect(restored.tiles.find((t) => t.id === "a")?.layout).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(restoreTile(restored, draft.tiles[0])).toBe(restored);
  });

  test("given lock screen positions, when the grid reports them unchanged, then the draft stays the same object; a taller tile is clipped to the band", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").note()).onLockscreen("a", { x: 0, y: 2, w: 2, h: 1 }).draft();

    // When
    const same = applyLockscreenLayout(draft, [{ i: "a", x: 0, y: 2, w: 2, h: 1 }]);
    const grown = applyLockscreenLayout(draft, [{ i: "a", x: 0, y: 2, w: 2, h: 3 }]);

    // Then
    expect(same).toBe(draft);
    expect(grown.lockscreen.placements[0].box).toEqual({ x: 0, y: 2, w: 2, h: 2 });
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

  test("given tiles fed by different accounts, when asking which use one, then only its tiles come back, by name and in wall order", () => {
    // Given
    const tiles = aWall()
      .with(aTile().withId("a").stat({ label: "MRR" }).metric("billing", "mrr", { connection: "c1" }))
      .with(aTile().withId("b").stat({ label: "Side MRR" }).metric("billing", "mrr", { connection: "c2" }))
      .with(aTile().withId("c").stat({}).metric("billing", "mrr", { connection: "c1" }).metric("billing", "mrr", { connection: "c1" }, "compare"))
      .with(aTile().withId("d").note())
      .build().tiles;

    // When
    const used = tilesUsing("c1", tiles, catalog);

    // Then
    expect(used).toEqual([
      { id: "a", name: "MRR" },
      { id: "c", name: catalog.widget("stat")!.name },
    ]);
    expect(tileConnections(tiles[2]!)).toEqual(["c1"]);
    expect(tilesUsing("gone", tiles, catalog)).toEqual([]);
  });
});

describe("Rearranging from the phone", () => {
  test("given tiles moved in the phone's two columns, when the wall takes them, then it keeps that order in four", () => {
    // Given: the note second on the phone, the countdown first
    const draft = aWall()
      .with(aTile().withId("note").note("Hi").at(0, 0, 2, 1))
      .with(aTile().withId("count").widget("countdown").at(2, 0, 1, 1))
      .draft();

    // When
    const moved = applyPhoneLayout(draft, [{ i: "count", x: 0, y: 0, w: 1, h: 1 }, { i: "note", x: 0, y: 1, w: 2, h: 1 }], catalog);

    // Then
    expect(readingOrder(moved.tiles).map((t) => t.id)).toEqual(["count", "note"]);
    expect(moved.tiles.every((t) => t.layout.x + t.layout.w <= WALL_COLUMNS)).toBe(true);
  });

  test("given a phone arrangement that changes nothing, when it's applied, then the very same draft comes back", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").note().at(0, 0, 2, 1)).draft();

    // When
    const same = applyPhoneLayout(draft, [{ i: "a", x: 0, y: 0, w: 2, h: 1 }], catalog);

    // Then
    expect(same).toBe(draft);
  });

  test("given a tile pulled to full width on the phone, when it lands on the wall, then it takes half the wall, not all of it", () => {
    // Given
    const draft = aWall().with(aTile().withId("a").note().at(0, 0, 1, 1)).draft();

    // When
    const wider = applyPhoneLayout(draft, [{ i: "a", x: 0, y: 0, w: 2, h: 1 }], catalog);

    // Then
    expect(wider.tiles[0].layout).toMatchObject({ w: 2, h: 1 });
  });

  test("given a tile that spans the wall, when it is left full width on the phone, then it still spans the wall", () => {
    // Given
    const draft = aWall().with(aTile().withId("wide").widget("heatmap").at(0, 0, 4, 1)).draft();

    // When
    const kept = applyPhoneLayout(draft, [{ i: "wide", x: 0, y: 0, w: 2, h: 1 }], catalog);

    // Then
    expect(kept.tiles[0].layout.w).toBe(4);
  });
});
