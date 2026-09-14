/** Who can show a plugin's contribution on a public wall: everyone, or paying owners. */
export const TIERS = ["free", "pro"] as const;
export type Tier = (typeof TIERS)[number];
