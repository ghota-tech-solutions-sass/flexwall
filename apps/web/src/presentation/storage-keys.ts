/** Keys the browser keeps between pages. Prefixed so they never meet another site's on the same origin. */
export const STORAGE_KEYS = {
  /** The handle typed on the landing page, prefilled after sign-in. */
  wantedHandle: "fw:wanted-handle",
} as const;
