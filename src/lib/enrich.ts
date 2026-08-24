import { identityLink } from "@/lib/identity-link";

/**
 * Identity enrichment, fetched server-side ONCE at credit time (webhook):
 *  - X handle  → profile picture via unavatar.io, stored as bytes in Firestore
 *  - website   → the page's <title> and meta description
 * Never throws; a seat without enrichment is just a seat.
 */

export interface Enrichment {
  avatarB64?: string;
  avatarType?: string;
  linkTitle?: string;
  linkDescription?: string;
}

const FETCH_TIMEOUT_MS = 6_000;
const MAX_AVATAR_BYTES = 300_000;
const MAX_HTML_BYTES = 400_000;

/** SSRF guard: only public http(s) hosts on default ports. */
export function isSafeExternalUrl(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "metadata" || h === "metadata.google.internal") return false;
  // IPv4 literals in private/reserved ranges
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false;
  }
  if (h.includes(":")) return false; // IPv6 literals: out of scope, refuse
  return true;
}

async function fetchCapped(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; type: string } | null> {
  const u = new URL(url);
  if (!isSafeExternalUrl(u)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "flexwall.lol seat enrichment (+https://flexwall.lol/about)" },
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Math.min(total, maxBytes));
    let off = 0;
    for (const c of chunks) {
      bytes.set(c.subarray(0, Math.min(c.byteLength, bytes.length - off)), off);
      off += c.byteLength;
      if (off >= bytes.length) break;
    }
    return { bytes, type: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clean(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}

/** Extract <title> and meta/og description from an HTML document. Exported for tests. */
export function extractPageMeta(html: string): { title?: string; description?: string } {
  const head = html.slice(0, 60_000);
  const title = /<title[^>]*>([\s\S]{1,400}?)<\/title>/i.exec(head)?.[1];
  const metas = [
    /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']{1,500})["']/i,
    /<meta[^>]+content=["']([^"']{1,500})["'][^>]*(?:name|property)=["'](?:og:)?description["']/i,
  ];
  let description: string | undefined;
  for (const re of metas) {
    const m = re.exec(head)?.[1];
    if (m) { description = m; break; }
  }
  return {
    title: title ? clean(decodeEntities(title)) || undefined : undefined,
    description: description ? clean(decodeEntities(description)) || undefined : undefined,
  };
}

/** Compute the enrichment for a display name. Returns {} when there is nothing to fetch. */
export async function enrichIdentity(name: string): Promise<Enrichment> {
  const link = identityLink(name);
  if (!link) return {};
  try {
    if (link.kind === "x") {
      const handle = link.href.split("/").pop();
      const got = await fetchCapped(`https://unavatar.io/x/${handle}?fallback=false`, MAX_AVATAR_BYTES);
      if (!got || !got.type.startsWith("image/")) return {};
      return { avatarB64: Buffer.from(got.bytes).toString("base64"), avatarType: got.type.split(";")[0] };
    }
    const out: Enrichment = {};
    const got = await fetchCapped(link.href, MAX_HTML_BYTES);
    if (got && /text\/html|application\/xhtml/.test(got.type)) {
      const meta = extractPageMeta(new TextDecoder("utf-8", { fatal: false }).decode(got.bytes));
      out.linkTitle = meta.title;
      out.linkDescription = meta.description;
    }
    // Favicon du site comme avatar de la place.
    const host = new URL(link.href).hostname;
    const icon = await fetchCapped(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, MAX_AVATAR_BYTES);
    if (icon && icon.type.startsWith("image/") && icon.bytes.byteLength > 200) {
      out.avatarB64 = Buffer.from(icon.bytes).toString("base64");
      out.avatarType = icon.type.split(";")[0];
    }
    return out;
  } catch {
    return {};
  }
}
