import { describe, expect, test } from "bun:test";
import { TILE_ID_PATTERN } from "@/domain/wall";
import { HttpEditorGateway, UNEXPLAINED_MESSAGE, UNREACHABLE_MESSAGE, type Fetch } from "@/infrastructure/http/editor-gateway";
import { editorDeps } from "@/presentation/editor/composition";
import { API } from "@/presentation/routes";
import { aWall } from "../builders";

function recording(answer: () => Promise<Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetch: Fetch = (path, init) => {
    calls.push({ path, init });
    return answer();
  };
  return { calls, gateway: new HttpEditorGateway(fetch) };
}

describe("Editor HTTP gateway", () => {
  test("given a draft, when saved, then it's sent as JSON to the wall endpoint", async () => {
    // Given
    const { calls, gateway } = recording(async () => Response.json({ wall: {} }));
    const draft = aWall().draft();

    // When
    const outcome = await gateway.saveWall(draft);

    // Then
    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(calls).toEqual([{ path: API.wall, init: { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) } }]);
  });

  test("given a connector that signs in at its provider, when starting, then the choices and the way back are posted and the address comes back", async () => {
    // Given
    const { calls, gateway } = recording(async () => Response.json({ url: "https://id.twitch.tv/oauth2/authorize?state=s" }));

    // When
    const outcome = await gateway.startSignIn("twitch", {}, "/edit");

    // Then
    expect(outcome).toEqual({ ok: true, value: "https://id.twitch.tv/oauth2/authorize?state=s" });
    expect(calls).toEqual([{ path: API.oauthStart, init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: "twitch", values: {}, returnTo: "/edit" }) } }]);
  });

  test("given the server explains a refusal, when connecting, then the owner gets its message", async () => {
    // Given
    const { gateway } = recording(async () => Response.json({ error: "connection_failed", message: "Stripe refused that key." }, { status: 422 }));

    // When
    const outcome = await gateway.connectAccount("stripe", { key: "rk_live_x" });

    // Then
    expect(outcome).toEqual({ ok: false, message: "Stripe refused that key." });
  });

  test("given no answer or an unexplained error, when calling, then the owner gets a plain sentence instead of nothing", async () => {
    // Given
    const offline = recording(() => Promise.reject(new TypeError("Failed to fetch")));
    const broken = recording(async () => new Response("<html>", { status: 502 }));

    // When
    const outcomes = [await offline.gateway.removeAccount("c1"), await broken.gateway.rotateLockscreenLink()];

    // Then
    expect(outcomes).toEqual([
      { ok: false, message: UNREACHABLE_MESSAGE },
      { ok: false, message: UNEXPLAINED_MESSAGE },
    ]);
    expect(offline.calls[0]).toEqual({ path: API.connection("c1"), init: { method: "DELETE" } });
  });

  test("given the browser composition, when a tile id is made, then the wall accepts it", () => {
    // Given
    const { newTileId } = editorDeps();

    // When
    const id = newTileId();

    // Then
    expect(TILE_ID_PATTERN.test(id)).toBe(true);
  });
});
