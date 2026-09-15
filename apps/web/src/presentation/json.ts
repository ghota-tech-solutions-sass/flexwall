/**
 * JSON over HTTP, shared by the server's request guard and the browser's
 * calls to it. Safe to import from client components.
 */

export const JSON_CONTENT_TYPE = "application/json";
export const JSON_HEADERS = { "content-type": JSON_CONTENT_TYPE } as const;

/** Named HTTP statuses the app answers or checks. */
export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  seeOther: 303,
  temporaryRedirect: 307,
  badRequest: 400,
  unauthorized: 401,
  paymentRequired: 402,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unprocessable: 422,
  internal: 500,
  unavailable: 503,
} as const;

export interface JsonAnswer<T> {
  ok: boolean;
  status: number;
  /** The parsed body, or an empty object when there was none. */
  body: Partial<T> & { message?: string };
}

/** POSTs `body` as JSON and reads the answer, never throwing on a non-2xx status or a bad body. */
export async function postJson<T>(path: string, body: unknown = {}): Promise<JsonAnswer<T>> {
  const res = await fetch(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const parsed = (await res.json().catch(() => ({}))) as JsonAnswer<T>["body"];
  return { ok: res.ok, status: res.status, body: parsed };
}

/** Sends `body` as JSON with any mutating method, never throwing on a non-2xx status or a bad body. */
export async function sendJson<T>(method: "POST" | "PUT" | "DELETE", path: string, body: unknown = {}): Promise<JsonAnswer<T>> {
  const res = await fetch(path, { method, headers: JSON_HEADERS, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, status: 0, body: { message: "Couldn't reach Flexwall. Check your connection and try again." } as JsonAnswer<T>["body"] };
  const parsed = (await res.json().catch(() => ({}))) as JsonAnswer<T>["body"];
  return { ok: res.ok, status: res.status, body: parsed };
}
