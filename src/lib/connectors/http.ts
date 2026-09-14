import { CATALOG, checkFields } from "@/lib/connectors/catalog";
import { ConnectorError, type Connector, type ConnectionData } from "@/lib/connectors/types";
import { readPath, safeFetchJson, SafeFetchError, toNumber, validateTarget } from "@/lib/net/safe-fetch";

/**
 * "Your API": one number read from a JSON endpoint the owner controls.
 * The URL is part of the secret, not the config: it often carries a token in
 * its query string, and keeping it server-side means nobody holding a preview
 * or image link can point the stored header at another host.
 */

async function readValue(conn: ConnectionData): Promise<number> {
  const { url, headerName, headerValue } = conn.secret;
  let body: unknown;
  try {
    body = await safeFetchJson(url, { headers: headerName && headerValue ? { [headerName]: headerValue } : {} });
  } catch (error) {
    if (error instanceof SafeFetchError) throw new ConnectorError(`The endpoint ${error.message}.`);
    throw error;
  }
  const path = conn.public.path ?? "";
  const raw = readPath(body, path);
  const n = toNumber(raw);
  if (n === null) {
    throw new ConnectorError(
      raw === undefined ? `Nothing found at "${path || "(whole body)"}" in the response.` : `The value at "${path || "(whole body)"}" isn't a number.`
    );
  }
  return n;
}

export const http: Connector = {
  spec: CATALOG.http,
  ttlMs: 10 * 60 * 1000,

  cacheKey: () => "value",

  async fetch({ connection }) {
    if (!connection) return { value: null };
    return { value: await readValue(connection) };
  },

  async connect(input) {
    const problem = checkFields(CATALOG.http.connection.fields, input);
    if (problem) throw new ConnectorError(problem + ".");
    const url = input.url.trim();
    try {
      validateTarget(url);
    } catch (error) {
      throw new ConnectorError(`The URL ${(error as Error).message}.`);
    }
    if (Boolean(input.headerName?.trim()) !== Boolean(input.headerValue?.trim())) {
      throw new ConnectorError("Fill in both the header name and its value, or neither.");
    }
    const host = new URL(url).host;
    const conn: ConnectionData = {
      secret: { url, headerName: input.headerName?.trim() ?? "", headerValue: input.headerValue?.trim() ?? "" },
      public: { host, path: input.path?.trim() ?? "", headerName: input.headerName?.trim() ?? "" },
    };
    const value = await readValue(conn);
    return { ...conn, label: host + (conn.public.path ? ` → ${conn.public.path}` : ""), values: { value } };
  },

  sample: () => 42,
};
