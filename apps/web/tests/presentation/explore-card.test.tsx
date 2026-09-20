import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WallCard } from "@/components/explore/WallCards";
import type { ExploreEntry } from "@/application/use-cases/explore";
import { catalog } from "@/plugins/registry";

test("Explore previews distinguish API provenance from connected-account verification", () => {
  const entry: ExploreEntry = { handle: "flexwall", title: "Flexwall", bio: "", theme: "", ranks: {}, updatedAt: 0, highlights: [
    { label: "Accounts", value: "5", connector: "Flexwall", verified: false },
    { label: "MRR", value: "$0", connector: "Stripe", verified: true },
  ] };
  const render = () => renderToStaticMarkup(<WallCard entry={entry} theme={catalog.defaultTheme()} now={0} />);
  expect(render()).toContain("API verified · Flexwall");
  expect(render()).toContain("Verified · Stripe");
  expect(render()).not.toContain("No verified numbers");
  entry.highlights = [];
  expect(render()).toContain("No synced numbers available yet");
});
