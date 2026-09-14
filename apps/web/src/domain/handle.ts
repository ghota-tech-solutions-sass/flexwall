import { DomainError } from "./errors";

/**
 * The name in `flexwall.lol/@handle`. Lowercase, 2 to 24 of a–z, 0–9 and
 * underscore, not a word the site needs for itself or that impersonates it.
 */
export type Handle = string & { readonly __brand: "Handle" };

const PATTERN = /^[a-z0-9_]{2,24}$/;

/** Words that would read as official, collide with routes, or invite impersonation. */
const RESERVED = new Set([
  "admin", "administrator", "api", "app", "about", "account", "billing", "blog", "contact", "dashboard", "docs",
  "edit", "editor", "explore", "flexwall", "help", "home", "legal", "login", "logout", "me", "new", "official",
  "onboarding", "pricing", "privacy", "root", "security", "settings", "signin", "signup", "staff", "status",
  "support", "system", "team", "terms", "u", "wall", "walls", "www", "stripe", "github", "moderator", "null", "undefined",
]);

export const Handle = {
  parse(raw: string): Handle {
    const value = raw.trim().replace(/^@/, "").toLowerCase();
    if (!PATTERN.test(value)) {
      throw new DomainError("invalid_handle", "Handles are 2 to 24 characters: letters, digits and underscores.");
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
