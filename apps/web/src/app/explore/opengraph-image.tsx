import { CARD_SIZE, demoPageCard } from "@/rendering/page-cards";

export const alt = "The Wall: builders ranked by verified numbers";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default function Image() {
  return demoPageCard({ kicker: "The Wall", title: "Builders who show their real numbers", body: "Ranked by verified revenue, commit streaks and stars." });
}
