import { describe, expect, test } from "bun:test";
import { calendar, checkPlugins, money, number, series, text, type Value } from "@flexwall/sdk";
import { satoriProblems, widgetProps } from "@flexwall/sdk/testing";
import core from "../src/index";

const sampleByType: Record<string, Value> = {
  number: money(4820, "usd"),
  series: series(Array.from({ length: 30 }, (_, i) => ({ t: `2026-08-${String(i + 1).padStart(2, "0")}`, v: 100 + i * 3 })), { unit: "currency", currency: "usd" }),
  calendar: calendar(Array.from({ length: 120 }, (_, i) => ({ date: new Date(Date.UTC(2026, 4, 18 + i)).toISOString().slice(0, 10), count: i % 5, level: (i % 5) as 0 | 1 | 2 | 3 | 4 }))),
  text: text("Shipping v2"),
};
const widget = (id: string) => core.widgets!.find((w) => w.id === id)!;

describe("core plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given
    const plugins = [core];

    // When
    const problems = checkPlugins(plugins);

    // Then
    expect(problems).toEqual([]);
  });

  for (const w of core.widgets!) {
    test(`given ${w.id} at every allowed size, when rendered, then the markup is Satori-safe`, () => {
      // Given
      const [minW, minH] = w.size.min;
      const [maxW, maxH] = w.size.max;
      const inputs = Object.fromEntries(w.inputs.map((i) => [i.key, sampleByType[i.accepts[0]]]));
      const options = w.id === "link" ? { url: "https://flexwall.lol", title: "Flexwall" } : {};

      for (let width = minW; width <= maxW; width++) {
        for (let height = minH; height <= maxH; height++) {
          // When
          const problems = satoriProblems(w.render(widgetProps(w, { inputs, options, box: { w: width, h: height } })));

          // Then
          expect({ size: `${width}x${height}`, problems }).toEqual({ size: `${width}x${height}`, problems: [] });
        }
      }
    });
  }

  test("given a euro amount and a goal, when a stat renders, then it shows the currency and the progress", () => {
    // Given
    const props = widgetProps(widget("stat"), { inputs: { value: money(4820, "eur") }, options: { label: "MRR", goal: 10000 } });

    // When
    const markup = JSON.stringify(widget("stat").render(props));

    // Then
    expect(markup).toContain("€4,820");
    expect(markup).toContain("48.2%");
  });

  test("given a plain count, when a stat renders, then no currency is invented", () => {
    // Given
    const props = widgetProps(widget("stat"), { inputs: { value: number(1613) }, options: { label: "followers" } });

    // When
    const markup = JSON.stringify(widget("stat").render(props));

    // Then
    expect(markup).toContain("1,613");
    expect(markup).not.toContain("$");
  });

  test("given a sensitive balance with a goal, when a stat renders, then it shows a range and no percentage that would give the amount back", () => {
    // Given
    const props = widgetProps(widget("stat"), { inputs: { value: money(2_431_900, "usd") }, options: { label: "Portfolio", goal: 5_000_000 } });
    props.inputs.value = { ...props.inputs.value!, source: { connector: "alpaca", name: "Alpaca", verified: true, sensitive: true } };

    // When
    const markup = JSON.stringify(widget("stat").render(props));

    // Then
    expect(markup).toContain("$1M+");
    expect(markup).not.toContain("2.4M");
    expect(markup).not.toContain("48.6%");
    expect(markup).not.toContain("0.48638");
  });

  test("given a sensitive balance the owner wants exact, when a stat renders, then the number is printed", () => {
    // Given
    const props = widgetProps(widget("stat"), { inputs: { value: money(2_431_900, "usd") }, options: { label: "Portfolio", display: "exact" } });
    props.inputs.value = { ...props.inputs.value!, source: { connector: "alpaca", name: "Alpaca", verified: true, sensitive: true } };

    // When
    const markup = JSON.stringify(widget("stat").render(props));

    // Then
    expect(markup).toContain("$2.4M");
  });

  test("given a sensitive balance history, when the trend renders, then the latest value is a range", () => {
    // Given
    const history = series([{ t: "2026-09-13", v: 2_300_000 }, { t: "2026-09-14", v: 2_431_900 }], { unit: "currency", currency: "usd" });
    const props = widgetProps(widget("sparkline"), { inputs: { series: history } });
    props.inputs.series = { ...props.inputs.series!, source: { connector: "alpaca", name: "Alpaca", verified: true, sensitive: true } };

    // When
    const markup = JSON.stringify(widget("sparkline").render(props));

    // Then
    expect(markup).toContain("$1M+");
    expect(markup).not.toContain("2.4M");
  });

  test("given a date, when the countdown renders on different days, then it counts in the owner's today", () => {
    // Given
    const render = (today: string) => JSON.stringify(widget("countdown").render(widgetProps(widget("countdown"), { options: { date: "2026-10-01", label: "until launch" }, today })));

    // When
    const before = render("2026-09-14");
    const on = render("2026-10-01");
    const after = render("2026-10-04");

    // Then
    expect(before).toContain('"17"');
    expect(on).toContain("Today");
    expect(after).toContain("+3");
  });
});
