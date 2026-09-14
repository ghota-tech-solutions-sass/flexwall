import type { FieldValues } from "@flexwall/sdk";
import type { EditorGateway, Outcome, Resolution } from "@/application/editor/ports";
import type { ConnectionView } from "@/domain/connection";
import type { Tile, WallDraft } from "@/domain/wall";
import { API } from "@/presentation/routes";

/** The subset of `fetch` the gateway uses. Injected so it runs against a fake in tests. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "content-type": "application/json" } as const;

/** Said when the request never got an answer: offline, or the server is unreachable. */
export const UNREACHABLE_MESSAGE = "Couldn't reach Flexwall. Check your connection and try again.";
/** Said when the server answered an error without explaining it. */
export const UNEXPLAINED_MESSAGE = "Something went wrong. Try again in a moment.";

/** The editor's calls, over the app's JSON API. Errors carry the server's `message`, written for the owner. */
export class HttpEditorGateway implements EditorGateway {
  constructor(private readonly fetch: Fetch) {}

  saveWall(draft: WallDraft): Promise<Outcome<void>> {
    return this.call("PUT", API.wall, draft, () => undefined);
  }

  resolveTiles(tiles: readonly Tile[]): Promise<Outcome<Resolution>> {
    return this.call("POST", API.wallResolve, { tiles }, (body) => body as Resolution);
  }

  connectAccount(connector: string, values: FieldValues): Promise<Outcome<ConnectionView>> {
    return this.call("POST", API.connections, { connector, values }, (body) => (body as { connection: ConnectionView }).connection);
  }

  removeAccount(connectionId: string): Promise<Outcome<void>> {
    return this.call("DELETE", API.connection(connectionId), undefined, () => undefined);
  }

  rotateLockscreenLink(): Promise<Outcome<string>> {
    return this.call("POST", API.lockscreenLink, {}, (body) => (body as { lockscreenPath: string }).lockscreenPath);
  }

  private async call<T>(method: "POST" | "PUT" | "DELETE", path: string, payload: unknown, read: (body: unknown) => T): Promise<Outcome<T>> {
    const init: RequestInit = payload === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(payload) };
    const response = await this.fetch(path, init).catch(() => null);
    if (!response) return { ok: false, message: UNREACHABLE_MESSAGE };
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: messageOf(body) ?? UNEXPLAINED_MESSAGE };
    return { ok: true, value: read(body) };
  }
}

function messageOf(body: unknown): string | null {
  return body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
}
