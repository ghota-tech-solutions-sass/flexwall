import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for connector secrets at rest (Stripe keys, API headers).
 * Format: "v1.<iv>.<tag>.<ciphertext>", base64url parts. The tag makes any
 * tampering fail loudly instead of decrypting to garbage.
 *
 * FLEXWALL_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32).
 * Rotating it makes every stored secret unreadable: owners reconnect.
 */

function key(): Buffer {
  const raw = process.env.FLEXWALL_ENCRYPTION_KEY?.trim();
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("FLEXWALL_ENCRYPTION_KEY must be 32 bytes, base64");
    return k;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FLEXWALL_ENCRYPTION_KEY is required in production");
  }
  return createHash("sha256").update("dev-only-flexwall-encryption-key").digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptJson<T>(sealed: string): T {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}
