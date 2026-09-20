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

test("demo revenue reconciles with the 30-day headline on every history chart", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { stripeConnector } = await import("@flexwall/plugin-stripe");
  const daily = stripeConnector.sample["revenue-daily"];
  const total = stripeConnector.sample.revenue30d;
  expect(daily.type).toBe("series");
  expect(total.type).toBe("number");
  if (daily.type !== "series" || total.type !== "number") throw new Error("Invalid sample types");
  expect(daily.points.reduce((sum,p)=>sum+Math.round(p.v*100),0)).toBe(total.value*100);
  for (const widget of [barChart,stepChart,sparkline]) {
    const props = widgetProps(widget,{ inputs:{series:daily}, options:{label:"Revenue, 30 days",summary:"sum"} });
    expect(renderToStaticMarkup(widget.render(props))).toContain("$5,310");
  }
});
