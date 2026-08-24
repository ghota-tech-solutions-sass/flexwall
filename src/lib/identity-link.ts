/**
 * Outbound link derived from a display name. Supported formats:
 *   "@handle"                      → https://x.com/handle
 *   "x.com/handle", "twitter.com/handle" (with or without scheme/@) → https://x.com/handle
 *   "https://site.tld/path", "http://…"  → as given
 *   "site.tld", "www.site.tld/page"      → https://site.tld/…
 * Anything else → null. Only http(s) ever comes out of here.
 */
export interface IdentityLink {
  href: string;
  /** Short label for the UI, e.g. "@handle on X" or "site.tld". */
  label: string;
  kind: "x" | "web";
}

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
// Bare domain, optional path. No spaces, no "@". Without a scheme we only
// accept common TLDs, so "crypto.karen" stays a name and "kittenclash.com" a link.
const BARE_DOMAIN = /^(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.([a-z]{2,24}))(?:\/[^\s]*)?$/i;
const KNOWN_TLDS = new Set([
  "com", "net", "org", "io", "co", "app", "dev", "ai", "xyz", "lol", "me", "gg", "tv", "sh", "so", "to", "ly",
  "fr", "de", "uk", "us", "ca", "es", "it", "nl", "be", "ch", "eu", "pt", "br", "in", "jp", "au", "se", "no",
  "fi", "dk", "pl", "ie", "at", "cz", "ro", "gr", "hu", "ru", "ua", "tr", "mx", "ar", "cl", "sg", "hk", "kr",
  "info", "biz", "pro", "club", "site", "online", "store", "shop", "tech", "cloud", "page", "one", "wtf",
  "finance", "money", "capital", "fund", "ventures", "vc", "cc", "fm", "am", "is", "ws", "cx", "lat",
]);

function xLink(handle: string): IdentityLink | null {
  const h = handle.replace(/^@+/, "");
  if (!X_HANDLE.test(h)) return null;
  return { href: `https://x.com/${h}`, label: `@${h} on X`, kind: "x" };
}

function webLink(url: URL): IdentityLink | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (X_HOSTS.has(url.hostname.toLowerCase())) {
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first ? xLink(first) : null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "";
  return { href: url.toString(), label: host + path, kind: "web" };
}

export function identityLink(name: string): IdentityLink | null {
  const raw = name.trim();
  if (!raw || /\s/.test(raw)) return null;

  if (raw.startsWith("@")) return xLink(raw);

  if (/^https?:\/\//i.test(raw)) {
    try {
      return webLink(new URL(raw));
    } catch {
      return null;
    }
  }

  // "x.com/handle", "site.tld", "www.site.tld/page"
  const m = BARE_DOMAIN.exec(raw);
  if (m && KNOWN_TLDS.has(m[2].toLowerCase())) {
    try {
      return webLink(new URL("https://" + raw));
    } catch {
      return null;
    }
  }
  return null;
}
