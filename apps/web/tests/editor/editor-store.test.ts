import { describe, expect, test } from "bun:test";
import { EDITOR_TIMINGS, editorTheme } from "@/application/editor/state";
import { createEditorStore } from "@/application/editor/store";
import type { ConnectionView } from "@/domain/connection";
import { entitlementsOf } from "@/domain/user";
import { aTile, aUser, aWall, NOW } from "../builders";
import { FakeEditorGateway, ManualScheduler, sequentialIds, settle } from "../fakes/editor";
import { testCatalog } from "../fakes/test-plugin";

const { catalog } = testCatalog();
const billingAccount: ConnectionView = { id: "c1", connector: "billing", label: "Acme", public: {}, createdAt: 0 };

function anEditor(options: { wall?: ReturnType<typeof aWall>; connections?: ConnectionView[]; pro?: boolean } = {}) {
  const gateway = new FakeEditorGateway();
  const scheduler = new ManualScheduler();
  const builder = options.wall ?? aWall();
  const user = options.pro ? aUser().pro().build() : aUser().build();
  const store = createEditorStore(
    { gateway, scheduler, catalog, newTileId: sequentialIds() },
    { handle: builder.build().handle, entitlements: entitlementsOf(user, NOW), draft: builder.draft(), connections: options.connections ?? [], lockscreenPath: "/l/wall/key", today: "2026-09-15" }
  );
  return { store, gateway, scheduler, actions: store.getState().actions };
}

describe("Editor store: saving", () => {
  test("given a few quick edits, when the autosave delay passes, then the wall is saved once with the last edit", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor();
    actions.setTitle("A");
    actions.setTitle("Ada");

    // When
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(gateway.saved.map((d) => d.title)).toEqual(["Ada"]);
    expect(store.getState().save).toEqual({ kind: "saved" });
  });

  test("given a save in flight, when the owner keeps typing, then that save doesn't claim the wall is saved and another one follows", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor();
    gateway.holdSaves = true;
    actions.setTitle("Ada");
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // When
    actions.setTitle("Ada Lovelace");
    gateway.releaseSaves();
    await settle();
    const afterFirst = store.getState().save;
    gateway.holdSaves = false;
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(afterFirst).toEqual({ kind: "dirty" });
    expect(gateway.saved.map((d) => d.title)).toEqual(["Ada", "Ada Lovelace"]);
    expect(store.getState().save).toEqual({ kind: "saved" });
  });

  test("given the server refuses the wall, when it's saved, then the owner sees why", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor();
    gateway.saveOutcome = { ok: false, message: "The Number tile at row 1, column 1: that Billing connection isn't yours." };

    // When
    actions.setBio("Building things");
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(store.getState().save).toEqual({ kind: "error", message: "The Number tile at row 1, column 1: that Billing connection isn't yours." });
  });

  test("given an edit that changes nothing, when applied, then the wall isn't marked dirty or saved", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor({ wall: aWall().unpublished() });
    const theme = store.getState().draft.theme;

    // When
    actions.setTheme(theme);
    actions.setListed(true); // not published: can't be listed
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(store.getState().save).toEqual({ kind: "saved" });
    expect(gateway.saved).toEqual([]);
  });
});

describe("Editor store: themes", () => {
  test("given a free owner, when they click a Pro theme, then the canvas tries it on but the wall keeps its theme and nothing is saved", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor({ wall: aWall().theme("paper") });

    // When
    actions.setTheme("sunset");
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    const state = store.getState();
    expect(editorTheme(state, catalog).id).toBe("sunset");
    expect(state.draft.theme).toBe("paper");
    expect(gateway.saved).toEqual([]);
  });

  test("given a Pro theme being tried on, when the owner picks a free theme or stops, then the canvas shows the wall's theme again", () => {
    // Given
    const { store, actions } = anEditor({ wall: aWall().theme("paper") });
    actions.setTheme("sunset");

    // When
    actions.endThemePreview();
    const afterStop = editorTheme(store.getState(), catalog).id;
    actions.setTheme("sunset");
    actions.setTheme("board");

    // Then
    expect(afterStop).toBe("paper");
    expect(store.getState().themePreview).toBeNull();
    expect(editorTheme(store.getState(), catalog).id).toBe("board");
  });

  test("given a wall kept on a Pro theme after Pro ended, when the editor opens, then it draws what the public page shows", () => {
    // Given
    const { store } = anEditor({ wall: aWall().theme("sunset") });

    // When
    const theme = editorTheme(store.getState(), catalog);

    // Then
    expect(theme.id).toBe(catalog.defaultTheme().id);
  });

  test("given a Pro owner, when they pick a Pro theme, then the wall is saved with it", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor({ pro: true });

    // When
    actions.setTheme("sunset");
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(store.getState().themePreview).toBeNull();
    expect(gateway.saved.map((d) => d.theme)).toEqual(["sunset"]);
  });
});

describe("Editor store: values", () => {
  test("given tiles being moved, when the layout changes, then no values are refetched; a new binding refetches once", async () => {
    // Given
    const { gateway, scheduler, actions } = anEditor({ wall: aWall().with(aTile().withId("a").stat().at(0, 0, 2, 1)) });

    // When
    actions.moveTiles([{ i: "a", x: 2, y: 1, w: 2, h: 1 }]);
    await scheduler.advance(EDITOR_TIMINGS.resolveMs);
    const afterMove = gateway.resolved.length;
    actions.pickSource({ tileId: "a", inputKey: "value" }, { kind: "metric", connector: "analytics", metric: "visitors" });
    await scheduler.advance(EDITOR_TIMINGS.resolveMs);

    // Then
    expect(afterMove).toBe(0);
    expect(gateway.resolved.length).toBe(1);
  });

  test("given two value requests racing, when the older one answers last, then the newer answer stays on screen", async () => {
    // Given
    const { store, gateway, actions } = anEditor({ wall: aWall().with(aTile().withId("a").stat()) });
    const answers: ((value: { states: Record<string, never>; today: string }) => void)[] = [];
    gateway.resolveTiles = () => new Promise((done) => answers.push((value) => done({ ok: true, value })));
    actions.start();
    actions.start();

    // When
    answers[1]({ states: {}, today: "2026-09-15" });
    answers[0]({ states: {}, today: "2026-09-14" });
    await settle();

    // Then
    expect(store.getState().today).toBe("2026-09-15");
  });
});

describe("Editor store: tiles", () => {
  test("given a deleted tile, when the owner undoes in time, then it comes back selected where it was", async () => {
    // Given
    const { store, scheduler, actions } = anEditor({ wall: aWall().with(aTile().withId("a").note().at(2, 0, 2, 1)) });
    actions.select("a");
    actions.removeTile("a");

    // When
    await scheduler.advance(EDITOR_TIMINGS.undoMs - 1);
    actions.undoRemove();

    // Then
    const state = store.getState();
    expect(state.draft.tiles.map((t) => [t.id, t.layout])).toEqual([["a", { x: 2, y: 0, w: 2, h: 1 }]]);
    expect(state.selected).toBe("a");
    expect(state.removed).toBeNull();
  });

  test("given a deleted tile, when the undo window passes, then it can't be brought back", async () => {
    // Given
    const { store, scheduler, actions } = anEditor({ wall: aWall().with(aTile().withId("a").note()) });
    actions.removeTile("a");

    // When
    await scheduler.advance(EDITOR_TIMINGS.undoMs);
    actions.undoRemove();

    // Then
    expect(store.getState().removed).toBeNull();
    expect(store.getState().draft.tiles).toEqual([]);
  });

  test("given a free wall at its tile limit, when the owner adds or duplicates a tile, then nothing is added", () => {
    // Given
    const wall = aWall();
    for (let i = 0; i < 8; i++) wall.with(aTile().withId(`n${i}`).note().at(0, i, 1, 1));
    const { store, actions } = anEditor({ wall });

    // When
    actions.addTile("note");
    actions.duplicateTile("n0");

    // Then
    expect(store.getState().draft.tiles).toHaveLength(8);
  });
});

describe("Editor store: accounts", () => {
  test("given two tiles waiting for Billing, when an account is connected from one of them, then both use it and it's listed", async () => {
    // Given
    const { store, gateway, scheduler, actions } = anEditor({
      wall: aWall()
        .with(aTile().withId("a").stat().metric("billing", "mrr", { connection: null }).at(0, 0, 2, 1))
        .with(aTile().withId("b").stat().metric("billing", "mrr", { connection: null }).at(2, 0, 2, 1)),
    });
    actions.requestConnect("a");

    // When
    const outcome = await actions.connectAccount("billing", { key: "key_live" }, { tileId: "a", inputKey: "value" });
    await scheduler.advance(EDITOR_TIMINGS.resolveMs);

    // Then
    const state = store.getState();
    expect(outcome.ok).toBe(true);
    expect(state.draft.tiles.map((t) => (t.inputs.value as { connection: string | null }).connection)).toEqual(["conn-billing", "conn-billing"]);
    expect(state.connections.map((c) => c.id)).toEqual(["conn-billing"]);
    expect(state.selected).toBe("a");
    expect(gateway.resolved).toHaveLength(1);
  });

  test("given a tile on one account, when a second account is connected for it, then only that tile switches", async () => {
    // Given
    const { store, actions } = anEditor({
      connections: [billingAccount],
      wall: aWall()
        .with(aTile().withId("a").stat().metric("billing", "mrr", { connection: "c1" }).at(0, 0, 2, 1))
        .with(aTile().withId("b").stat().metric("billing", "mrr", { connection: "c1" }).at(2, 0, 2, 1)),
    });

    // When
    await actions.connectAccount("billing", { key: "key_other" }, { tileId: "b", inputKey: "value" });

    // Then
    expect(store.getState().draft.tiles.map((t) => (t.inputs.value as { connection: string }).connection)).toEqual(["c1", "conn-billing"]);
  });

  test("given two Billing accounts, when the owner picks the second one on a tile, then only that tile switches and the wall is saved", async () => {
    // Given
    const otherAccount: ConnectionView = { ...billingAccount, id: "c2", label: "Side project" };
    const { store, gateway, scheduler, actions } = anEditor({
      connections: [billingAccount, otherAccount],
      wall: aWall()
        .with(aTile().withId("a").stat().metric("billing", "mrr", { connection: "c1" }).at(0, 0, 2, 1))
        .with(aTile().withId("b").stat().metric("billing", "mrr", { connection: "c1" }).at(2, 0, 2, 1)),
    });

    // When
    actions.chooseAccount({ tileId: "b", inputKey: "value" }, "c2");
    await scheduler.advance(EDITOR_TIMINGS.autosaveMs);

    // Then
    expect(store.getState().draft.tiles.map((t) => (t.inputs.value as { connection: string }).connection)).toEqual(["c1", "c2"]);
    expect(gateway.saved).toHaveLength(1);
    expect(gateway.resolved).toHaveLength(1);
  });

  test("given a refused key, when connecting, then the reason comes back and nothing changes", async () => {
    // Given
    const { store, gateway, actions } = anEditor({ wall: aWall().with(aTile().withId("a").stat().metric("billing", "mrr", { connection: null })) });
    gateway.connectOutcome = () => ({ ok: false, message: "Key must start with key_" });
    const before = store.getState();

    // When
    const outcome = await actions.connectAccount("billing", { key: "nope" }, { tileId: "a", inputKey: "value" });

    // Then
    expect(outcome).toEqual({ ok: false, message: "Key must start with key_" });
    expect(store.getState().draft).toBe(before.draft);
    expect(store.getState().connections).toEqual([]);
  });

  test("given an account in use, when it's removed, then its tiles wait for a new one", async () => {
    // Given
    const { store, gateway, actions } = anEditor({ connections: [billingAccount], wall: aWall().with(aTile().withId("a").stat().metric("billing", "mrr", { connection: "c1" })) });

    // When
    await actions.removeAccount(billingAccount);

    // Then
    expect(gateway.removedAccounts).toEqual(["c1"]);
    expect(store.getState().connections).toEqual([]);
    expect(store.getState().draft.tiles[0].inputs.value).toMatchObject({ connection: null });
  });

  test("given a picked metric, when the owner already has an account for it, then the binding uses that account", () => {
    // Given
    const { store, actions } = anEditor({ connections: [billingAccount], wall: aWall().with(aTile().withId("a").stat()) });

    // When
    actions.pickSource({ tileId: "a", inputKey: "value" }, { kind: "metric", connector: "billing", metric: "mrr" });

    // Then
    expect(store.getState().draft.tiles[0].inputs.value).toMatchObject({ kind: "metric", connector: "billing", connection: "c1", history: null });
  });
});

describe("Editor store: lock screen", () => {
  test("given a full lock screen, when another tile is put on it, then the owner is told why and the draft is unchanged", () => {
    // Given
    const { store, actions } = anEditor({ wall: aWall().with(aTile().withId("wide").note().at(0, 0, 4, 4)).with(aTile().withId("more").note().at(0, 4, 1, 1)).onLockscreen("wide", { x: 0, y: 0, w: 4, h: 4 }) });
    const before = store.getState().draft;

    // When
    actions.toggleLockscreen("more", true);

    // Then
    expect(store.getState().lockscreenError).toBe("The lock screen is full. Remove a tile or make one smaller.");
    expect(store.getState().draft).toBe(before);
  });
});
