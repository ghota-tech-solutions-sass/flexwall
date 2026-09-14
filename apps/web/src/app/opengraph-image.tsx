import { CARD_SIZE, demoPageCard } from "@/rendering/page-cards";

export const alt = "Flexwall: your numbers, live, on one page";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

export default function Image() {
  return demoPageCard({ kicker: "flexwall.lol", title: "Your numbers, live, on one page", body: "Stripe MRR, GitHub streaks and any API, on a public wall and your lock screen." });
}
