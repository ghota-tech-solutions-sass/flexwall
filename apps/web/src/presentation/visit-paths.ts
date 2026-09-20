import { ROUTES } from "./routes";
const pages: readonly string[] = [ROUTES.home, ROUTES.demo, ROUTES.pricing, ROUTES.explore, ROUTES.integrations, ROUTES.legal, ROUTES.terms, ROUTES.privacy, ROUTES.legalFr, ROUTES.termsFr, ROUTES.privacyFr];
/** Excludes private screens, query strings, media and unknown routes. */
export function visitTarget(path: string): { kind: "page" | "wall" | "integration"; id: string } | null {
  if (pages.includes(path)) return { kind: "page", id: path };
  const wall = /^\/(?:@|u\/)([a-z0-9][a-z0-9-]{1,29})$/.exec(path);
  if (wall) return { kind: "wall", id: wall[1] };
  const integration = /^\/integrations\/([a-z0-9-]+)$/.exec(path);
  return integration ? { kind: "integration", id: integration[1] } : null;
}
