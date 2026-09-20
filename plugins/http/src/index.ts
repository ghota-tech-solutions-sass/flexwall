import { BlockedRequestError, ConnectorError, defineConnector, definePlugin, field, HttpError, number, text, type ConnectorContext } from "@flexwall/sdk";

/**
 * "Your API": one value read from a JSON endpoint the owner controls. The URL
 * is part of the secret, not the wall: it often carries a token in its query
 * string, and keeping it server-side means nobody holding a wall can aim the
 * stored header at another host.
 */

/** Reads `data.items[0].mrr` style paths. Empty path means the whole body. Own properties only. */
export function readPath(body: unknown, path: string): unknown {
  const tokens = path.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = body;
  for (const t of tokens) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = t.startsWith("[") ? Number(t.slice(1, -1)) : t;
    if (Array.isArray(cur) !== (typeof key === "number")) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[,_\s]/g, "");
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

async function read(secret: Record<string, string>, ctx: ConnectorContext): Promise<unknown> {
  const headers = secret.headerName && secret.headerValue ? { [secret.headerName]: secret.headerValue } : undefined;
  try {
    return readPath(await ctx.fetch.json(secret.url, { headers }), secret.path ?? "");
  } catch (error) {
    if (error instanceof BlockedRequestError) throw new ConnectorError(`The endpoint ${error.message}.`);
    if (error instanceof HttpError) throw new ConnectorError(`The endpoint answered HTTP ${error.status}.`);
    throw error;
  }
}

const httpConnector = defineConnector({
  id: "http",
  name: "Your API",
  description: "A number or a line of text from any HTTPS endpoint that answers JSON.",
  icon: "M8 3H6a3 3 0 0 0-3 3v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a3 3 0 0 0 3 3h2M16 3h2a3 3 0 0 1 3 3v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a3 3 0 0 1-3 3h-2",
  tier: "pro",
  // The owner controls the endpoint: fetching it proves synchronization, not authenticity.
  verified: false,
  ttl: 600,
  auth: {
    label: "Add an endpoint",
    help: "Any HTTPS URL that answers JSON. Point at the value with a path like data.mrr or items[0].count. It's fetched when your wall is drawn, at most every 10 minutes.",
    fields: [
      field.url("url", "URL", { placeholder: "https://api.example.com/stats" }),
      field.text("path", "Path to the value", { placeholder: "data.mrr", maxLength: 200, optional: true, pattern: "^[A-Za-z0-9_$\\-.[\\]]*$", patternMessage: "can only use names, dots and [index]" }),
      field.text("headerName", "Header name", { placeholder: "Authorization", maxLength: 64, optional: true, pattern: "^[A-Za-z0-9-]*$", patternMessage: "isn't a valid header name" }),
      field.secret("headerValue", "Header value", { placeholder: "Bearer …", maxLength: 2000, optional: true }),
    ],
  },
  metrics: [
    { id: "value", name: "Number", type: "number" },
    { id: "text", name: "Text", type: "text" },
  ],
  cacheKey: () => "endpoint",

  async fetch({ secret }, ctx) {
    if (!secret?.url) return {};
    const raw = await read(secret, ctx);
    const n = toNumber(raw);
    return {
      value: n === null ? null : number(n),
      text: typeof raw === "string" || typeof raw === "number" ? text(String(raw).slice(0, 280)) : null,
    };
  },

  async connect(input, ctx) {
    const url = String(input.url ?? "").trim();
    const headerName = String(input.headerName ?? "").trim();
    const headerValue = String(input.headerValue ?? "").trim();
    if (Boolean(headerName) !== Boolean(headerValue)) throw new ConnectorError("Fill in both the header name and its value, or neither.");
    const secret = { url, path: String(input.path ?? "").trim(), headerName, headerValue };
    const raw = await read(secret, ctx);
    if (raw === undefined) throw new ConnectorError(`Nothing found at "${secret.path || "(whole body)"}" in the response.`);
    if (typeof raw === "object" && raw !== null) throw new ConnectorError(`"${secret.path || "(whole body)"}" is an object, point at a number or a string inside it.`);
    const host = new URL(url).host;
    return {
      secret,
      public: { host, path: secret.path, headerName },
      label: host + (secret.path ? ` → ${secret.path}` : ""),
    };
  },

  sample: { value: number(42), text: text("Shipping v2 this week") },
});

export default definePlugin({
  id: "http",
  name: "Your API",
  description: "Any value from your own JSON endpoint.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [httpConnector],
});

export { httpConnector };
