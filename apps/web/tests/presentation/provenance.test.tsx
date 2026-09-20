import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { number } from "@flexwall/sdk";
import { httpConnector } from "@flexwall/plugin-http";
import { WallGrids } from "@/components/wall/WallView";
import { catalog } from "@/plugins/registry";
import { demoWall } from "@/rendering/samples";

test("API response verification is distinguished from connected-account verification", () => {
  const today = "2026-09-20";
  const tile = demoWall(today).tiles[0]!;
  const render = (source?: { connector: string; name: string; verified: boolean }) => renderToStaticMarkup(<WallGrids tiles={[tile]} states={{ [tile.id]: { status: "ready", inputs: { value: { value: number(123), stale: false, ...(source ? { source } : {}) } } } }} theme={catalog.defaultTheme()} today={today} catalog={catalog} />);
  const api = render({ connector: httpConnector.id, name: httpConnector.name, verified: httpConnector.verified });
  expect(api).toContain("API verified · Your API");
  expect(api).not.toContain("Source verified:");
  expect(render()).toContain("Manually entered");
  expect(render()).not.toContain("Source verified:");
  expect(render({ connector: "stripe", name: "Stripe", verified: true })).toContain("Source verified: retrieved directly from Stripe");
});

test("verified source badges survive every sharing surface", async () => {
  const { TileBody } = await import("@/rendering/tile");
  const today = "2026-09-20";
  const tile = demoWall(today).tiles[0]!;
  for (const surface of ["page", "card", "lockscreen"] as const) {
    const markup = renderToStaticMarkup(<TileBody tile={tile} state={{ status: "ready", inputs: { value: { value: number(123), stale: false, source: { connector: "stripe", name: "Stripe", verified: true } } } }} box={tile.layout} theme={catalog.defaultTheme()} surface={surface} u={(n) => n} today={today} catalog={catalog} />);
    expect(markup).toContain("Verified · Stripe");
    expect(markup).toContain("not entered manually in Flexwall");
    expect(markup).toContain("<svg");
  }
});
