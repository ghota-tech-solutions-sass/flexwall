import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two capabilities per wallpaper, both HMACs of the id and a per-wall nonce:
 *  - the image key: in the Shortcut's URL, lets anyone holding it fetch the PNG
 *  - the edit key: in the private edit link, lets its holder change the config
 * Nothing to store but the nonces; rotating a nonce revokes the old link.
 */

function secret(): string {
  const s = process.env.FLEXWALL_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail closed: a known fallback would let anyone mint edit keys.
    throw new Error("FLEXWALL_SECRET is required in production");
  }
  return "dev-only-flexwall-secret";
}

function mac(kind: "img" | "edit", id: string, nonce: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${id}:${nonce}`).digest("base64url").slice(0, 32);
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const imageKey = (id: string, nonce: string) => mac("img", id, nonce);
export const editKey = (id: string, nonce: string) => mac("edit", id, nonce);

export function verifyImageKey(id: string, nonce: string, key: string | null | undefined): boolean {
  return Boolean(key) && same(imageKey(id, nonce), key!);
}

export function verifyEditKey(id: string, nonce: string, key: string | null | undefined): boolean {
  return Boolean(key) && same(editKey(id, nonce), key!);
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Short, unambiguous, URL-safe id. 10 chars of 32 symbols ≈ 50 bits. */
export function newId(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function newNonce(): string {
  return randomBytes(9).toString("base64url");
}
