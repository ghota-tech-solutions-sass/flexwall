import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/lib/config";
import { createWall, getWall, listPublicWalls, markPro, updateWall } from "@/lib/store/walls";
import { editKey, imageKey, newId, verifyEditKey, verifyImageKey } from "@/lib/tokens";
import { effectiveConfig, toView } from "@/lib/wall-server";

describe("tokens", () => {
  test("keys verify only for their own kind, id and nonce", () => {
    const k = imageKey("abcdefghij", "n1");
    expect(verifyImageKey("abcdefghij", "n1", k)).toBe(true);
    expect(verifyImageKey("abcdefghij", "n2", k)).toBe(false);
    expect(verifyImageKey("abcdefghik", "n1", k)).toBe(false);
    expect(verifyEditKey("abcdefghij", "n1", k)).toBe(false);
    expect(verifyEditKey("abcdefghij", "n1", editKey("abcdefghij", "n1"))).toBe(true);
    expect(verifyEditKey("abcdefghij", "n1", null)).toBe(false);
  });

  test("ids are url-safe and unambiguous", () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[a-km-np-z2-9]{10}$/);
  });
});

describe("walls store (memory)", () => {
  test("create, patch, unlock once, list when public", async () => {
    const wall = await createWall({ ...DEFAULT_CONFIG, theme: "gold" });
    expect((await getWall(wall.id))!.pro).toBe(false);

    // Pro theme on a free wall renders as Ink.
    expect(effectiveConfig(wall).theme).toBe("ink");

    const updated = await updateWall(wall.id, { public: true });
    expect(updated!.public).toBe(true);
    expect((await listPublicWalls()).some((w) => w.id === wall.id)).toBe(false); // not Pro yet

    expect(await markPro(wall.id, "checkout:cs_1", "Buyer@Example.com")).toBe(true);
    expect(await markPro(wall.id, "checkout:cs_1")).toBe(false); // replay
    expect(await markPro(wall.id, "checkout:cs_2")).toBe(false); // second payment, already Pro
    const pro = (await getWall(wall.id))!;
    expect(pro.pro).toBe(true);
    expect(pro.email).toBe("buyer@example.com");
    expect(effectiveConfig(pro).theme).toBe("gold");
    expect((await listPublicWalls()).some((w) => w.id === wall.id)).toBe(true);
  });

  test("unknown walls", async () => {
    expect(await getWall("../etc")).toBeNull();
    expect(await updateWall("zzzzzzzzzz", { public: true })).toBeNull();
    expect(await markPro("zzzzzzzzzz", "checkout:cs_x")).toBe(false);
  });

  test("the owner view never leaks nonces or email", async () => {
    const wall = await createWall(DEFAULT_CONFIG);
    const view = toView({ ...wall, email: "a@b.c" });
    const json = JSON.stringify(view);
    expect(json).not.toContain(wall.imgNonce);
    expect(json).not.toContain(wall.editNonce);
    expect(json).not.toContain("a@b.c");
    expect(view.imagePath).toBe(`/i/${wall.id}/${imageKey(wall.id, wall.imgNonce)}`);
  });
});

describe("connections store", () => {
  test("save, cache values, delete with its cache", async () => {
    const { saveConnection, saveCachedValues, deleteConnection } = await import("@/lib/store/walls");
    const wall = await createWall(DEFAULT_CONFIG);
    await saveConnection(wall.id, { id: "c0nn1234", source: "http", label: "api.example.com", public: { host: "api.example.com" }, sealed: "v1.x.y.z", createdAt: 1 });
    await saveCachedValues(wall.id, "http|c0nn1234|value", { at: 5, values: { value: 42 } });
    await saveCachedValues(wall.id, "github|-|repo:vercel/next.js", { at: 6, values: { stars: 1 } });
    let w = (await getWall(wall.id))!;
    expect(w.connections?.c0nn1234.label).toBe("api.example.com");
    expect(w.valueCache?.["http|c0nn1234|value"].values.value).toBe(42);
    expect(w.valueCache?.["github|-|repo:vercel/next.js"].values.stars).toBe(1);

    await deleteConnection(wall.id, "c0nn1234", ["http|c0nn1234|value"]);
    w = (await getWall(wall.id))!;
    expect(w.connections?.c0nn1234).toBeUndefined();
    expect(w.valueCache?.["http|c0nn1234|value"]).toBeUndefined();
    expect(w.valueCache?.["github|-|repo:vercel/next.js"]).toBeDefined();
    expect(JSON.stringify(toView(w))).not.toContain("v1.x.y.z");
  });
});
