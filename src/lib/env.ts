/**
 * Fails loudly when a required env var is missing at call time — not at
 * import time — so routes that don't need it keep working during partial
 * deploys (same convention as lettrio).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/** True when a real card processor is configured. */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Public origin of the app, for redirects and absolute URLs.
 * Next's standalone server resolves `req.url` on HOSTNAME:PORT (0.0.0.0:3000 on
 * Cloud Run), so never derive redirect targets from it. Prefer the configured
 * NEXT_PUBLIC_APP_URL, then the proxy headers, then the request itself.
 */
export function publicOrigin(req: { headers: Headers; url: string }): string {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
