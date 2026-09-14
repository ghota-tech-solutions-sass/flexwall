import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * Fetches JSON from a URL a user typed, without letting that URL reach
 * anything private. This server runs on Cloud Run next to the metadata server,
 * whose tokens can send mail as the Workspace domain: one request to
 * 169.254.169.254 would be a real incident, not a rough edge.
 *
 * Guarantees:
 *  - https only, standard or explicit port
 *  - every resolved address is checked AT CONNECT TIME (the `lookup` hook), so
 *    DNS rebinding between a check and the request can't slip through
 *  - IP literals are checked before any socket is opened (lookup is skipped for them)
 *  - redirects are refused, not followed
 *  - 5s budget, 256KB body cap, JSON only
 *
 * `fetch` has no lookup hook, which is why this uses node:https.
 */

export class SafeFetchError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True when an address must never be contacted. Unparseable counts as private. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  // IPv4 smuggled in IPv6: ::ffff:10.0.0.1, ::ffff:a00:1, and NAT64 64:ff9b::/96.
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const hexMapped = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hexMapped) {
    const n = (parseInt(hexMapped[1], 16) << 16) | parseInt(hexMapped[2], 16);
    return blocked.check([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."), "ipv4");
  }
  return blocked.check(address, "ipv6");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) {
  dnsLookup(hostname, { family: options.family, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new SafeFetchError(`${hostname} resolves to a private address`), { code: "EPRIVATE" }), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "cookie", "upgrade"]);

export function validateTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("isn't a valid URL");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("must use https://");
  if (url.username || url.password) throw new SafeFetchError("can't contain a username or password");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) throw new SafeFetchError("points at a private address");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new SafeFetchError("points at a private host");
  return url;
}

export async function safeFetchJson(raw: string, opts: SafeFetchOptions = {}): Promise<unknown> {
  const url = validateTarget(raw);
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "flexwall.lol wallpaper renderer" };
  for (const [name, value] of Object.entries(opts.headers ?? {})) {
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new SafeFetchError(`header ${name} isn't allowed`);
    headers[name] = value;
  }
  const maxBytes = opts.maxBytes ?? 256_000;
  const timeoutMs = opts.timeoutMs ?? 5000;

  return new Promise((resolve, reject) => {
    const fail = (e: Error) => {
      clearTimeout(timer);
      req.destroy();
      reject(e instanceof SafeFetchError ? e : new SafeFetchError(e.message));
    };
    const req = https.request(
      url,
      { method: "GET", headers, lookup: guardedLookup as never, agent: false },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) return fail(new SafeFetchError(`answered a redirect (${status}); use the final URL`));
        if (status < 200 || status >= 300) return fail(new SafeFetchError(`answered HTTP ${status}`));
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) return fail(new SafeFetchError("answered more than 256 KB"));
          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new SafeFetchError("didn't answer JSON"));
          }
        });
        res.on("error", fail);
      }
    );
    const timer = setTimeout(() => fail(new SafeFetchError(`took longer than ${timeoutMs / 1000}s`)), timeoutMs);
    req.on("error", fail);
    req.end();
  });
}

/** Reads `data.items[0].mrr` style paths. Empty path means the whole body. */
export function readPath(body: unknown, path: string): unknown {
  const tokens = path.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = body;
  for (const t of tokens) {
    if (cur === null || typeof cur !== "object") return undefined;
    const key = t.startsWith("[") ? Number(t.slice(1, -1)) : t;
    if (Array.isArray(cur) !== (typeof key === "number")) return undefined;
    // Own properties only: no walking into __proto__ or constructor.
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim().replace(/[,_\s]/g, ""))) {
    return Number(value.trim().replace(/[,_\s]/g, ""));
  }
  return null;
}
