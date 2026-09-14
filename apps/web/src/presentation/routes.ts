/**
 * Every address the app links to or calls, in one place. Pages, redirects,
 * sitemaps and the browser's API client read from here; nothing spells a
 * path by hand. `next.config.ts` maps the public `/@handle` onto `/u/[handle]`.
 */

const segment = (value: string) => encodeURIComponent(value);

export const ROUTES = {
  home: "/",
  login: "/login",
  /** After a sign-in link that expired. */
  loginExpired: "/login?expired=1",
  onboarding: "/onboarding",
  edit: "/edit",
  settings: "/settings",
  pricing: "/pricing",
  explore: "/explore",
  exploreSorted: (sort: string) => `/explore?${new URLSearchParams({ sort })}`,
  integrations: "/integrations",
  integration: (id: string) => `/integrations/${segment(id)}`,
  legal: "/legal",
  terms: "/terms",
  privacy: "/privacy",
  report: (handle: string) => `/report?${new URLSearchParams({ handle })}`,
  wall: (handle: string) => `/@${handle}`,
  referral: (handle: string) => `/r/${segment(handle)}`,
  lockscreen: (wallId: string, key: string) => `/l/${segment(wallId)}/${segment(key)}`,
} as const;

export const API = {
  wall: "/api/wall",
  wallResolve: "/api/wall/resolve",
  lockscreenLink: "/api/wall/lockscreen-link",
  connections: "/api/connections",
  connection: (id: string) => `/api/connections/${segment(id)}`,
  handle: "/api/me/handle",
  signInRequest: "/api/auth/request",
  signOut: "/api/auth/logout",
  billingCheckout: "/api/billing/checkout",
  billingPortal: "/api/billing/portal",
  report: "/api/report",
} as const;
