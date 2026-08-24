import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session minimale "my seat" : un cookie signé contenant le slug,
 * émis au retour du checkout (/entered). Pas de compte, pas de mot de passe.
 *
 * Secret : AUTH_SESSION_SECRET (généré par Terraform en prod, comme chez
 * lettrio). En dev sans secret, un secret de démo est utilisé avec warning.
 */

const COOKIE_NAME = "fw_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 jours

function secret(): string {
  const s = process.env.AUTH_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail closed: a known fallback secret would let anyone forge a seat cookie.
    throw new Error("AUTH_SESSION_SECRET is required in production");
  }
  return "dev-only-flexwall-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

type Kind = "session" | "magic";

function createToken(kind: Kind, slug: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ k: kind, slug, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(kind: Kind, token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    // Legacy session tokens carry no kind; treat them as sessions.
    const k: Kind = data.k ?? "session";
    if (k !== kind) return null;
    if (typeof data.slug !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data.slug;
  } catch {
    return null;
  }
}

export function createSessionToken(slug: string): string {
  return createToken("session", slug, MAX_AGE_S * 1000);
}

export function verifySessionToken(token: string | undefined): string | null {
  return verifyToken("session", token);
}

/**
 * Magic link token, emailed to the payer. Distinct kind from the cookie so a
 * leaked link can only be exchanged at /me/link, never pasted in as a cookie.
 */
export function createMagicToken(slug: string, ttlMs: number): string {
  return createToken("magic", slug, ttlMs);
}

export function verifyMagicToken(token: string | undefined): string | null {
  return verifyToken("magic", token);
}

export const MAGIC_LINK_TTL_MS = 30 * 60 * 1000; // lookup link: 30 minutes
export const WELCOME_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // welcome mail: 7 days

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_S;
