/**
 * Every address the app links to or calls, in one place. Pages, redirects,
 * sitemaps and the browser's API client read from here; nothing spells a
 * path by hand. `next.config.ts` maps the public `/@handle` onto `/u/[handle]`.
 */

import type { BillingPlan } from "@/domain/pricing";

const segment = (value: string) => encodeURIComponent(value);

/**
 * The handle someone typed before they had an account. It travels on the
 * sign-in link, because the link is opened wherever the mail is read — another
 * tab, another browser, another phone — and nothing stored in the first tab
 * survives that trip.
 */
export const HANDLE_PARAM = "handle";

/** Query parameters of the sign-in link. The browser adds its time zone so a new account starts on the owner's day. */
export const SIGN_IN_PARAMS = { token: "token", timeZone: "tz", handle: HANDLE_PARAM, plan: "plan" } as const;

/** Query parameters /settings reads. */
export const SETTINGS_PARAMS = { upgraded: "upgraded", seats: "seats" } as const;

/** The connected-accounts section of settings, where paying for one more starts. */
export const PAID_ACCOUNTS_ANCHOR = "accounts";

/** Query parameters added to the page an owner returns to after signing in at a provider. */
export const CONNECT_PARAMS = { connected: "connected", error: "connect_error" } as const;

/** Query parameters /login reads. */
export const LOGIN_PARAMS = { expired: "expired", handle: HANDLE_PARAM, plan: "plan" } as const;

/** Query parameters /onboarding reads. */
export const ONBOARDING_PARAMS = { handle: HANDLE_PARAM, plan: "plan" } as const;

/** A query flag's "on" value. */
const FLAG_ON = "1";

/** Where route families start, for prefixes (robots) and builders alike. */
const PREFIX = { api: "/api/", lockscreen: "/l/", referral: "/r/", report: "/report", admin: "/admin" } as const;

const SIGN_IN_VERIFY = `${PREFIX.api}auth/verify`;

export const ROUTES = {
  home: "/",
  demo: "/demo",
  login: "/login",
  /** After a sign-in link that expired. */
  loginExpired: `/login?${new URLSearchParams({ [LOGIN_PARAMS.expired]: FLAG_ON })}`,
  /** Signing in to claim the handle that was typed on the way here. */
  loginToClaim: (handle: string) => (handle ? `/login?${new URLSearchParams({ [LOGIN_PARAMS.handle]: handle })}` : "/login"),
  loginForPlan: (plan: BillingPlan) => `/login?${new URLSearchParams({ plan })}`,
  onboarding: "/onboarding",
  /** Picking a handle with the one already typed filled in. */
  onboardingToClaim: (handle: string) => (handle ? `/onboarding?${new URLSearchParams({ [ONBOARDING_PARAMS.handle]: handle })}` : "/onboarding"),
  edit: "/edit",
  settings: "/settings",
  /** The back office: accounts, offered Pro, moderation. Answers 404 to anyone but administrators. */
  admin: PREFIX.admin,
  adminAccounts: (query: { q?: string; source?: string }) => {
    const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])));
    return params.size ? `${PREFIX.admin}?${params}` : PREFIX.admin;
  },
  adminAccount: (id: string) => `${PREFIX.admin}/accounts/${segment(id)}`,
  /** The back office page for connectors: environments and who may use them. */
  adminConnectors: `${PREFIX.admin}/connectors`,
  pricing: "/pricing",
  pricingForPlan: (plan: string) => `/pricing?${new URLSearchParams({ plan })}`,
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
  /** Settings after paying for a connected account: says it's on its way. */
  settingsAccountAdded: `/settings?${new URLSearchParams({ [SETTINGS_PARAMS.seats]: FLAG_ON })}#${PAID_ACCOUNTS_ANCHOR}`,
  settingsAccounts: `/settings#${PAID_ACCOUNTS_ANCHOR}`,
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
  /** Starts a sign-in at a provider: answers where to send the owner. */
  oauthStart: "/api/connections/oauth",
  adminPro: (accountId: string) => `/api/admin/accounts/${segment(accountId)}/pro`,
  adminWall: (accountId: string) => `/api/admin/accounts/${segment(accountId)}/wall`,
  adminPaidAccounts: (accountId: string) => `/api/admin/accounts/${segment(accountId)}/paid-accounts`,
  adminConnectors: "/api/admin/connectors",
  /** Where providers send the owner back. Registered with each provider, so never rename it. */
  oauthCallback: "/api/connections/oauth/callback",
  handle: "/api/me/handle",
  signInRequest: "/api/auth/request",
  signOut: "/api/auth/logout",
  billingCheckout: "/api/billing/checkout",
  billingPortal: "/api/billing/portal",
  billingPaidAccounts: "/api/billing/paid-accounts",
  report: "/api/report",
  signInVerify: SIGN_IN_VERIFY,
  /** The link mailed to sign in, carrying the handle it was asked for, if any. */
  signInLink: (token: string, handle?: string, plan?: string) =>
    `${SIGN_IN_VERIFY}?${new URLSearchParams({ [SIGN_IN_PARAMS.token]: token, ...(handle ? { [SIGN_IN_PARAMS.handle]: handle } : {}), ...(plan ? { [SIGN_IN_PARAMS.plan]: plan } : {}) })}`,
} as const;

/** Path prefixes of screens and links that must stay out of search engines. */
export const PRIVATE_PATH_PREFIXES = [PREFIX.api, ROUTES.edit, ROUTES.settings, ROUTES.onboarding, PREFIX.lockscreen, PREFIX.referral, PREFIX.report, PREFIX.admin] as const;
