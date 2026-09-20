/** Only a hostname may cross into public tile state. Never return a URL or connection metadata. */
export function publicSourceDomain(host: unknown): string | undefined {
  if (typeof host !== "string" || !host || /[\s/@?#\\]/.test(host)) return undefined;
  try {
    const url = new URL(`https://${host}`);
    return url.host === host.toLowerCase() ? url.hostname : undefined;
  } catch {
    return undefined;
  }
}
