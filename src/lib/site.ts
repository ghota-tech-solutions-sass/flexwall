import { optionalEnv } from "@/lib/env";
import type { WallConfig } from "@/lib/config";

export const SITE_NAME = "Flexwall";
export const SITE_URL = optionalEnv("NEXT_PUBLIC_APP_URL", "https://flexwall.lol").replace(/\/+$/, "");
export const SITE_TAGLINE = "A lock screen that flexes for you";
export const SITE_DESCRIPTION =
  "Your goal, your countdown and your GitHub streak on your iPhone lock screen, redrawn every morning by a Shortcut. No app.";

export const PRO_PRICE_CENTS = 499;
export const PRO_PRICE_LABEL = "$4.99";

/** What the owner's browser gets back: never the nonces, never the email. */
export interface WallView {
  id: string;
  config: WallConfig;
  pro: boolean;
  public: boolean;
  imagePath: string;
  editPath: string;
  lastRenderAt: number | null;
}
