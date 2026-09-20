import { expect, test } from "bun:test";
import { money, series } from "@flexwall/sdk";
import { widgetProps } from "@flexwall/sdk/testing";
import { barChart, stepChart, goalRing, chartGeometry } from "../src/widgets/extra-charts";

test("bar scale includes zero and supports empty, flat, negative and extreme finite series", () => {
  for (const values of [[], [0], [4, 4], [-10, 10], [-9, -2], [1e308, -1e308]]) {
    const { zero, points } = chartGeometry(values);
    expect(Number.isFinite(zero)).toBe(true);
    for (const point of points) {
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.y).toBeGreaterThanOrEqual(6);
      expect(point.y).toBeLessThanOrEqual(94);
    }
  }
  const mixed = chartGeometry([-10, 10]);
  expect(mixed.points[0].y).toBeGreaterThan(mixed.zero);
  expect(mixed.points[1].y).toBeLessThan(mixed.zero);
});

test("history charts distinguish empty history from a zero observation", () => {
  for (const widget of [barChart, stepChart]) {
    const empty = JSON.stringify(widget.render(widgetProps(widget, { inputs: { series: series([]) } })));
    expect(empty).toContain("No history yet");
    const zero = JSON.stringify(widget.render(widgetProps(widget, { inputs: { series: series([{ t: "2026-09-20", v: 0 }]) } })));
    expect(zero).not.toContain("No history yet");
    expect(zero).not.toContain("NaN");
  }
});

test("goal rings do not disclose sensitive balances through an arc or a percentage", () => {
  const props = widgetProps(goalRing, { inputs: { value: money(2431900, "usd") }, options: { goal: 5000000 } });
  props.inputs.value!.source = { connector: "bank", name: "Bank", verified: true, sensitive: true };
  const hidden = JSON.stringify(goalRing.render(props));
  expect(hidden).toContain("$1M+");
  expect(hidden).not.toContain("strokeDasharray");
  expect(hidden).not.toContain("48.6");
  props.options.display = "exact";
  expect(JSON.stringify(goalRing.render(props))).toContain("strokeDasharray");
});
