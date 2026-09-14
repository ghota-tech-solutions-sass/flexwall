import { FREE_TILE_LIMIT } from "@/domain/user";
import { PLAN_PRICES_USD } from "@/domain/pricing";
import { ROUTES } from "../routes";
import { SITE_DESCRIPTION } from "./structured-data";
import type { IntegrationPage } from "./integrations";

/** /llms.txt: a plain summary of the product for AI assistants and answer engines (llmstxt.org). */
export function llmsTxt(origin: string, integrations: readonly IntegrationPage[]): string {
  const at = (path: string) => origin.replace(/\/+$/, "") + path;
  return [
    "# Flexwall",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Flexwall lets builders, creators and indie hackers publish a wall of live tiles at flexwall.lol/@handle. Tiles read numbers from the accounts that produce them (revenue from Stripe, commit streaks from GitHub, downloads from npm, any JSON API) and redraw on their own. The same wall becomes a share card for social posts and an iPhone lock screen. Numbers read from an owner's own account carry a verified badge; The Wall ranks walls by verified revenue, streaks and stars.",
    "",
    "## Plans",
    "",
    `- Free: one public wall, ${FREE_TILE_LIMIT} tiles, basic connectors, a small flexwall.lol mark on images.`,
    `- Pro: $${PLAN_PRICES_USD.monthly} a month or $${PLAN_PRICES_USD.yearly} a year, taxes included. Unlimited tiles, every connector and theme, value history, no mark.`,
    `- Lifetime: $${PLAN_PRICES_USD.lifetime} once. Pro for the life of the service.`,
    "",
    "## Main pages",
    "",
    `- [Home](${at(ROUTES.home)}): what Flexwall is, with an example wall`,
    `- [The Wall](${at(ROUTES.explore)}): public walls ranked by verified numbers`,
    `- [Pricing](${at(ROUTES.pricing)})`,
    `- [Integrations](${at(ROUTES.integrations)}): every service a tile can read from`,
    "",
    "## Integrations",
    "",
    ...integrations.map((i) => `- [${i.name}](${at(i.path)}): ${i.description}`),
    "",
    "## Legal",
    "",
    `- [Terms of service](${at(ROUTES.terms)})`,
    `- [Privacy policy](${at(ROUTES.privacy)})`,
    `- [Legal notice](${at(ROUTES.legal)})`,
    "",
  ].join("\n");
}
