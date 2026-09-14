import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SecretBox } from "@/application/ports";

/**
 * AES-256-GCM for connector secrets at rest. Format "v1.<iv>.<tag>.<ciphertext>",
 * base64url. The auth tag makes tampering fail loudly instead of decrypting to garbage.
 * Rotating the key makes every stored secret unreadable: owners reconnect.
 */
export class AesSecretBox implements SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string | undefined, production: boolean) {
    if (base64Key) {
      this.key = Buffer.from(base64Key, "base64");
      if (this.key.length !== 32) throw new Error("FLEXWALL_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
    } else if (production) {
      throw new Error("FLEXWALL_ENCRYPTION_KEY is required in production");
    } else {
      this.key = createHash("sha256").update("dev-only-flexwall-encryption-key").digest();
    }
  }

  seal(value: Record<string, string>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
  }

  open(sealed: string): Record<string, string> {
    const [version, iv, tag, ct] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as Record<string, string>;
  }
}
