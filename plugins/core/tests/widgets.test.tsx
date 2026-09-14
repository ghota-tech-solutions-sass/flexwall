import { describe, expect, test } from "bun:test";
import { calendar, checkPlugins, money, number, series, text, type Value } from "@flexwall/sdk";
import { satoriProblems, widgetProps } from "@flexwall/sdk/testing";
import core from "../src/index";

const sampleInputs: Record<string, Value> = {
  number: money(4820, "usd"),
  series: series(Array.from({ length: 30 }, (_, i) => ({ t: `2026-08-${String(i + 1).padStart(2, "0")}`, v: 100 + i * 3 })), { unit: "currency", currency: "usd" }),
  calendar: calendar(Array.from({ length: 120 }, (_, i) => ({ date: new Date(Date.UTC(2026, 4, 18 + i)).toISOString().slice(0, 10), count: i % 5, level: (i % 5) as 0 | 1 | 2 | 3 | 4 }))),
  text: text("Shipping v2"),
};

describe("core plugin", () => {
  test("passes the plugin checks", () => {
    expect(checkPlugins([core])).toEqual([]);
  });

  for (const widget of core.widgets!) {
    test(`${widget.id} renders Satori-safe markup at every allowed size`, () => {
      const [minW, minH] = widget.size.min;
      const [maxW, maxH] = widget.size.max;
      for (let w = minW; w <= maxW; w++) {
        for (let h = minH; h <= maxH; h++) {
          const inputs = Object.fromEntries(widget.inputs.map((i) => [i.key, sampleInputs[i.accepts[0]]]));
          const options = widget.id === "countdown" ? { date: "2026-10-01", label: "until launch" } : widget.id === "link" ? { url: "https://flexwall.lol", title: "Flexwall" } : {};
          const props = widgetProps(widget, { inputs, options, box: { w, h } });
          const problems = satoriProblems(widget.render(props));
          expect({ size: `${w}x${h}`, problems }).toEqual({ size: `${w}x${h}`, problems: [] });
        }
      }
    });
  }

  test("stat shows the currency of the data and a goal bar", () => {
    const stat = core.widgets!.find((w) => w.id === "stat")!;
    const html = JSON.stringify(stat.render(widgetProps(stat, { inputs: { value: money(4820, "eur") }, options: { label: "MRR", goal: 10000 } })));
    expect(html).toContain("€4,820");
    expect(html).toContain("48.2%");
  });

  test("countdown counts in the owner's today", () => {
    const countdown = core.widgets!.find((w) => w.id === "countdown")!;
    const out = (today: string) => JSON.stringify(countdown.render(widgetProps(countdown, { options: { date: "2026-10-01", label: "until launch" }, today })));
    expect(out("2026-09-14")).toContain('"17"');
    expect(out("2026-10-01")).toContain("Today");
    expect(out("2026-10-04")).toContain("+3");
  });

  test("number values keep plain counts plain", () => {
    const stat = core.widgets!.find((w) => w.id === "stat")!;
    expect(JSON.stringify(stat.render(widgetProps(stat, { inputs: { value: number(1613) }, options: { label: "followers" } })))).toContain("1,613");
  });
});
