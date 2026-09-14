import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { BlockedRequestError, HttpError, type GuardedFetch, type GuardedFetchInit } from "@flexwall/sdk";

/**
 * The network, as plugins see it (`ctx.fetch`). Every connector request goes
 * through here, whether the URL is fixed (api.github.com) or typed by a user.
 *
 * Why so strict: this server runs on Cloud Run next to the metadata server,
 * whose tokens can send mail as the Workspace domain. One request to
 * 169.254.169.254 would be an incident.
 *
 *  - https only, no credentials in the URL
 *  - every resolved address checked AT CONNECT TIME (the `lookup` hook), so DNS
 *    rebinding between a check and the request can't slip through; IP literals
 *    are checked up front because lookup is skipped for them
 *  - redirects refused, not followed
 *  - size and time capped
 *
 * `fetch` has no lookup hook, hence node:https.
 */

const DEFAULT_MAX_BYTES = 1_000_000;
const HARD_MAX_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 6000;
const HARD_TIMEOUT_MS = 15_000;

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
      return callback(Object.assign(new BlockedRequestError(`${hostname} resolves to a private address`), { code: "EPRIVATE" }), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "cookie", "upgrade"]);

export function validateTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedRequestError("isn't a valid URL");
  }
  if (url.protocol !== "https:") throw new BlockedRequestError("must use https://");
  if (url.username || url.password) throw new BlockedRequestError("can't contain a username or password");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) throw new BlockedRequestError("points at a private address");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new BlockedRequestError("points at a private host");
  return url;
}

function request(raw: string, init: GuardedFetchInit = {}): Promise<string> {
  const url = validateTarget(raw);
  const headers: Record<string, string> = { "User-Agent": "flexwall.lol (+https://flexwall.lol)" };
  for (const [name, value] of Object.entries(init.headers ?? {})) {
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new BlockedRequestError(`header ${name} isn't allowed`);
    headers[name] = value;
  }
  const maxBytes = Math.min(init.maxBytes ?? DEFAULT_MAX_BYTES, HARD_MAX_BYTES);
  const timeoutMs = Math.min(init.timeoutMs ?? DEFAULT_TIMEOUT_MS, HARD_TIMEOUT_MS);
  const method = init.method ?? "GET";

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      reject(e instanceof BlockedRequestError || e instanceof HttpError ? e : new BlockedRequestError(e.message));
    };
    const req = https.request(url, { method, headers, lookup: guardedLookup as never, agent: false }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) return fail(new BlockedRequestError(`answered a redirect (${status}); use the final URL`));
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) return fail(new BlockedRequestError(`answered more than ${Math.round(maxBytes / 1000)} KB`));
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (settled) return;
        const body = Buffer.concat(chunks).toString("utf8");
        if (status < 200 || status >= 300) return fail(new HttpError(status, raw, body.slice(0, 2000)));
        settled = true;
        clearTimeout(timer);
        resolve(body);
      });
      res.on("error", fail);
    });
    const timer = setTimeout(() => fail(new BlockedRequestError(`took longer than ${timeoutMs / 1000}s`)), timeoutMs);
    req.on("error", fail);
    if (init.body) req.write(init.body);
    req.end();
  });
}

export const guardedFetch: GuardedFetch = {
  async json<T>(url: string, init?: GuardedFetchInit): Promise<T> {
    const body = await request(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new BlockedRequestError("didn't answer JSON");
    }
  },
  text: (url, init) => request(url, init),
};
