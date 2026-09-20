import { expect, test } from "bun:test";
import { series } from "@flexwall/sdk";
import { widgetProps } from "@flexwall/sdk/testing";
import { barChart, stepChart, sparkline } from "@flexwall/plugin-core";

test("interactive history labels include dates and exact values, but respect private ranges", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  for (const widget of [barChart, stepChart, sparkline]) {
    const props = widgetProps(widget, { inputs: { series: series([{ t: "2026-09-19", v: 2431900.12 }, { t: "2026-09-20", v: 2431900.12 }], { unit: "currency", currency: "usd" }) } });
    props.surface = "page";
    expect(renderToStaticMarkup(widget.render(props))).toContain("2026-09-20 · $2,431,900.12");
    props.inputs.series!.source = { connector: "bank", name: "Bank", verified: true, sensitive: true };
    const privateMarkup = renderToStaticMarkup(widget.render(props));
    expect(privateMarkup).toContain("2026-09-20 · $1M+");
    expect(privateMarkup).not.toContain("2,431,900");
    expect(privateMarkup).not.toContain("data-figure");
    props.surface = "card";
    expect(renderToStaticMarkup(widget.render(props))).not.toContain("data-chart-point");
  }
});
