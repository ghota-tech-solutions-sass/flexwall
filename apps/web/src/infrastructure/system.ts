import { randomBytes } from "node:crypto";
import type { Clock, ConnectorRuntime, IdGenerator } from "@/application/ports";
import { guardedFetch } from "./net/guarded-fetch";

export class SystemClock implements Clock {
  now() {
    return Date.now();
  }
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** 14 unambiguous characters, about 70 bits. */
export class RandomIds implements IdGenerator {
  next() {
    let out = "";
    for (const b of randomBytes(14)) out += ALPHABET[b % ALPHABET.length];
    return out;
  }
}

/**
 * The context plugins run in. `env` exposes an allowlist only: a plugin can
 * read the GitHub token the host chose to share, never the Stripe secret or
 * the encryption key.
 */
export class GuardedRuntime implements ConnectorRuntime {
  constructor(private readonly sharedEnv: readonly string[]) {}

  context(today: string) {
    return {
      fetch: guardedFetch,
      today,
      env: (name: string) => (this.sharedEnv.includes(name) ? process.env[name]?.trim() || undefined : undefined),
      log: (message: string) => console.log(`[connector] ${message}`),
    };
  }
}
