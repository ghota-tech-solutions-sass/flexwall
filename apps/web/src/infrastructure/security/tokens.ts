import { createHmac, timingSafeEqual } from "node:crypto";
import type { Clock, TokenService } from "@/application/ports";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_TTL_MS = 20 * 60 * 1000;

type Kind = "session" | "magic";

/**
 * Stateless signed tokens: `<base64url payload>.<hmac>`. The kind is inside the
 * signed payload, so a sign-in link can never be replayed as a session cookie.
 * Lock screen keys are HMACs of the wall id and its nonce: rotating the nonce
 * revokes the link without storing anything.
 */
export class HmacTokenService implements TokenService {
  private readonly secret: string;

  constructor(
    secret: string | undefined,
    production: boolean,
    private readonly clock: Clock
  ) {
    if (!secret && production) throw new Error("FLEXWALL_SECRET is required in production");
    this.secret = secret || "dev-only-flexwall-secret";
  }

  session(userId: string) {
    return this.sign("session", userId, SESSION_TTL_MS);
  }

  verifySession(token: string | undefined) {
    return this.verify("session", token);
  }

  magic(email: string) {
    return this.sign("magic", email, MAGIC_TTL_MS);
  }

  verifyMagic(token: string | undefined) {
    return this.verify("magic", token);
  }

  lockKey(wallId: string, nonce: string) {
    return this.mac(`lock:${wallId}:${nonce}`).slice(0, 32);
  }

  verifyLockKey(wallId: string, nonce: string, key: string) {
    return same(this.lockKey(wallId, nonce), key);
  }

  private mac(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }

  private sign(kind: Kind, subject: string, ttl: number): string {
    const payload = Buffer.from(JSON.stringify({ k: kind, s: subject, e: this.clock.now() + ttl })).toString("base64url");
    return `${payload}.${this.mac(payload)}`;
  }

  private verify(kind: Kind, token: string | undefined): string | null {
    if (!token) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig || !same(this.mac(payload), sig)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { k?: string; s?: unknown; e?: unknown };
      if (data.k !== kind || typeof data.s !== "string" || typeof data.e !== "number" || data.e < this.clock.now()) return null;
      return data.s;
    } catch {
      return null;
    }
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
