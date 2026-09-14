import { DomainError } from "./errors";

/**
 * The name in `flexwall.lol/@handle`: a URL slug. Lowercase a–z and 0–9 in
 * words joined by single hyphens, 2 to 30 characters, not a word the site
 * needs for itself or that impersonates it.
 */
export type Handle = string & { readonly __brand: "Handle" };

export const HANDLE_MAX_LENGTH = 30;

const PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Words that would read as official, collide with routes, or invite impersonation. */
const RESERVED = new Set([
  "admin", "administrator", "api", "app", "about", "account", "billing", "blog", "contact", "dashboard", "docs",
  "edit", "editor", "explore", "flexwall", "help", "home", "legal", "login", "logout", "me", "new", "official",
  "onboarding", "pricing", "privacy", "root", "security", "settings", "signin", "signup", "staff", "status",
  "support", "system", "team", "terms", "u", "wall", "walls", "www", "stripe", "github", "moderator", "null", "undefined",
]);

export const Handle = {
  /**
   * What a handle field shows while someone types: "Ghota Tech_Solutions"
   * becomes "ghota-tech-solutions". Accents are dropped, anything else becomes a
   * hyphen. A trailing hyphen is kept so the next word can be typed.
   */
  slugify(raw: string): string {
    return raw
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, HANDLE_MAX_LENGTH);
  },

  parse(raw: string): Handle {
    const value = Handle.slugify(raw).replace(/-+$/, "");
    if (value.length < 2 || !PATTERN.test(value)) {
      throw new DomainError("invalid_handle", `Handles are 2 to ${HANDLE_MAX_LENGTH} characters: letters, digits and hyphens.`);
    }
    if (RESERVED.has(value)) throw new DomainError("handle_reserved", `@${value} is reserved.`);
    return value as Handle;
  },

  isValid(raw: string): boolean {
    try {
      Handle.parse(raw);
      return true;
    } catch {
      return false;
    }
  },
};
