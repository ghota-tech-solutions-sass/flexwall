/**
 * Every address the app links to or calls, in one place. Pages, redirects,
 * sitemaps and the browser's API client read from here; nothing spells a
 * path by hand. `next.config.ts` maps the public `/@handle` onto `/u/[handle]`.
 */

const segment = (value: string) => encodeURIComponent(value);

/** Query parameters of the sign-in link. The browser adds its time zone so a new account starts on the owner's day. */
export const SIGN_IN_PARAMS = { token: "token", timeZone: "tz" } as const;

/** Query parameters /settings reads. */
export const SETTINGS_PARAMS = { upgraded: "upgraded" } as const;

/** Query parameters /login reads. */
export const LOGIN_PARAMS = { expired: "expired" } as const;

/** A query flag's "on" value. */
const FLAG_ON = "1";

/** Where route families start, for prefixes (robots) and builders alike. */
const PREFIX = { api: "/api/", lockscreen: "/l/", referral: "/r/", report: "/report" } as const;

const SIGN_IN_VERIFY = `${PREFIX.api}auth/verify`;

export const ROUTES = {
  home: "/",
  login: "/login",
  /** After a sign-in link that expired. */
  loginExpired: `/login?${new URLSearchParams({ [LOGIN_PARAMS.expired]: FLAG_ON })}`,
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
  report: (handle: string) => `${PREFIX.report}?${new URLSearchParams({ handle })}`,
  wall: (handle: string) => `/@${handle}`,
  referral: (handle: string) => `${PREFIX.referral}${segment(handle)}`,
  lockscreen: (wallId: string, key: string) => `${PREFIX.lockscreen}${segment(wallId)}/${segment(key)}`,
  /** Settings after a paid checkout: says Pro is on its way. */
  settingsUpgraded: `/settings?${new URLSearchParams({ [SETTINGS_PARAMS.upgraded]: FLAG_ON })}`,
  legalFr: "/fr/mentions-legales",
  termsFr: "/fr/cgv",
  privacyFr: "/fr/confidentialite",
  /** The square app icon Next generates from app/apple-icon.tsx. */
  appleIcon: "/apple-icon",
  /** The vector app icon, app/icon.svg. */
  icon: "/icon.svg",
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
  signInVerify: SIGN_IN_VERIFY,
  /** The link mailed to sign in. */
  signInLink: (token: string) => `${SIGN_IN_VERIFY}?${new URLSearchParams({ [SIGN_IN_PARAMS.token]: token })}`,
} as const;

/** Path prefixes of screens and links that must stay out of search engines. */
export const PRIVATE_PATH_PREFIXES = [PREFIX.api, ROUTES.edit, ROUTES.settings, ROUTES.onboarding, PREFIX.lockscreen, PREFIX.referral, PREFIX.report] as const;
