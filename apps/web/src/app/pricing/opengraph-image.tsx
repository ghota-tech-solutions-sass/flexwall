import { PAID_ACCOUNT_PRICE_USD, PLAN_PRICES_USD } from "@/domain/pricing";
import { CARD_SIZE, demoPageCard } from "@/rendering/page-cards";

export const alt = "Flexwall pricing";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

export default function Image() {
  return demoPageCard({
    kicker: "Flexwall pricing",
    title: "Free to start. Pro when your numbers matter.",
    body: `Pro $${PLAN_PRICES_USD.monthly} a month or $${PLAN_PRICES_USD.yearly} a year. Connected bank and brokerage accounts $${PAID_ACCOUNT_PRICE_USD} a month each.`,
  });
}
