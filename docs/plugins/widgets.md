# Writing a widget

A widget renders values inside a tile. The **same `render` function** draws the
public page, the editor, the share card and the lock screen.

```tsx
import { asType, currencySymbol, defineWidget, field, formatNumber } from "@flexwall/sdk";
import { Col, Text, fitFont } from "@flexwall/sdk/ui";

export const bigNumber = defineWidget<{ label: string }>({
  id: "big-number",
  name: "Big number",
  description: "One number, as big as the tile allows.",
  category: "numbers",
  inputs: [{ key: "value", label: "Number", accepts: ["number"] }],
  options: [field.text("label", "Label", { maxLength: 40, optional: true })],
  size: { default: [1, 1], min: [1, 1], max: [2, 2] },

  render({ inputs, options, area, theme, u }) {
    const n = asType(inputs.value!.value, "number")!;
    const shown = (n.unit === "currency" ? currencySymbol(n.currency) : "") + formatNumber(n.value);
    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(11), color: theme.muted }}>{options.label || " "}</Text>
        <Text style={{ fontSize: u(fitFont(shown, area.width, area.height * 0.6)), color: theme.ink, fontFamily: theme.display.family }}>{shown}</Text>
      </Col>
    );
  },
});
```

## The definition

| Field | Meaning |
|---|---|
| `id` | Unique across plugins. Stored in walls. |
| `category` | Where it's listed in the editor: `numbers`, `charts`, `progress`, `time`, `content`. |
| `inputs` | Data slots. `accepts` lists value types. Required inputs are guaranteed present when `render` runs; the host draws a placeholder otherwise. |
| `options` | Appearance settings, declared as fields. The inspector draws them. |
| `size` | `[w, h]` in grid cells for `default`, `min`, `max`. The wall is 4 columns wide. |
| `chrome` | `"card"` (default): the host draws the tile background, border and padding. `"bare"`: you get the whole tile. |
| `excludeSurfaces` | Surfaces you can't draw on, e.g. `["lockscreen"]`. |
| `renderPage` | Optional richer version for the public page (a real link, a title attribute). Same rules. |

## What `render` receives

```ts
{ inputs, options, box, area, theme, surface, u, today }
```

| Prop | What |
|---|---|
| `inputs[key].value` | A `Value`. `inputs[key].stale` is true when the upstream failed and this is the last known value. `source` says which connector and whether it's verified. |
| `options` | Validated option values, defaults applied. |
| `box` | Tile size in cells, `{ w, h }`. |
| `area` | Your drawing area in **units**, after card padding. Use it to fit content. |
| `theme` | Colors, fonts, radius. Never hardcode colors. |
| `u(n)` | A length of `n` units. Pass it straight into a style. |
| `today` | The owner's date, YYYY-MM-DD. |
| `surface` | `page`, `editor`, `card` or `lockscreen`. Most widgets ignore it. |

## Rule 1: units, never pixels

One cell is 100 units wide; the gap between cells is 12 units. So a 2×1 tile is
212 × 100 units, minus 28 units of card padding: `area` is `{ width: 184, height: 72 }`.

`u(n)` returns pixels on images and a CSS length on the page, tied to the
tile's width. Write every size with it and the widget scales from a phone to a
share card:

```tsx
<Text style={{ fontSize: u(12), marginTop: u(4) }}>…</Text>
```

`fitFont(text, widthInUnits, maxUnits)` picks a font size that keeps text on one line.

## Rule 2: Satori-safe markup

Images are drawn by [Satori](https://github.com/vercel/satori), which supports a
subset of HTML and CSS:

- **Flexbox and absolute positioning only.** No `display: grid`, no floats.
- **`display: flex` on any element with more than one child.** The SDK's `Row`, `Col`, `Fill` and `Text` do it for you.
- **Inline styles only.** No `className`, no CSS files.
- **No hooks, no event handlers, no state.** `render` is a pure function of its props.
- **SVG works** for charts: `svg`, `path`, `polyline`, `polygon`, `rect`, `circle`. See `sparkPoints` in the SDK and the `sparkline` widget.
- **Avoid `overflow: hidden` on containers with many children.** Satori turns it into a clip path on every descendant; it once made a heatmap 25× slower. Fit content with `area` instead. It's fine on a single text element.
- **Stick to Latin text and common punctuation in fixed strings.** Other glyphs make the renderer download fonts at render time. People's own text is their business.

## Motion comes for free

On web pages the host animates walls once, when they scroll into view:
figures count up, lines and areas draw from left to right, bars fill and
heatmap columns light up. Images are never animated. Your widget gets this
without any code if it:

- prints its main figure as the only text of an element, at 18 px or more
  (`$4,820`, `47 days`, `+12.4%`), with labels in their own elements;
- draws lines inside an `svg`;
- builds progress with `Bar` from `@flexwall/sdk/ui`.

Nothing moves for visitors who ask their system for reduced motion.

## Testing

```tsx
import { satoriProblems, widgetProps } from "@flexwall/sdk/testing";

test("given every allowed size, when rendered, then images can draw it", () => {
  // Given
  const sizes = [{ w: 1, h: 1 }, { w: 2, h: 2 }];

  // When
  const problems = sizes.flatMap((box) => satoriProblems(bigNumber.render(widgetProps(bigNumber, { inputs: { value: number(1280) }, box }))));

  // Then
  expect(problems).toEqual([]);
});
```

- `widgetProps(widget, { inputs, options, box, theme, today })` builds realistic props with 1 unit = 1 px.
- `satoriProblems(element)` lists what Satori would reject: missing `display: flex`, grid, classes, handlers.

To see real pixels, run the app (`bun run dev`), add your widget to a wall and
open the lock screen tab, or fetch `/demo/card.png` after adding it to the demo
wall in `apps/web/src/rendering/samples.ts`.
