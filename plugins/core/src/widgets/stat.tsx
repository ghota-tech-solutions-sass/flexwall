import { asType, currencySymbol, defineWidget, displayAdvance, field, formatBand, formatNumber, formatPercent, NUMBER_DISPLAY_OPTIONS, seriesChange, showsRange } from "@flexwall/sdk";
import { Bar, Col, Fill, Row, Text, fitFont } from "@flexwall/sdk/ui";

type Options = { label: string; prefix: string; suffix: string; goal?: number; display: string };

/**
 * One number, as big as the tile allows. Takes a number, or a series (shows the
 * latest point and its change). A goal turns it into a progress tile.
 */
export const stat = defineWidget<Options>({
  id: "stat",
  name: "Number",
  description: "A single number with a label. Add a goal to get a progress bar.",
  category: "numbers",
  inputs: [{ key: "value", label: "Number", accepts: ["number", "series"] }],
  options: [
    field.text("label", "Label", { placeholder: "MRR", maxLength: 40, optional: true }),
    field.text("prefix", "Before the number", { placeholder: "$", maxLength: 4, optional: true, help: "Leave empty to use the currency of the data." }),
    field.text("suffix", "After the number", { placeholder: "users", maxLength: 8, optional: true }),
    field.number("goal", "Goal", { optional: true, min: 0, help: "Draws a progress bar toward this number." }),
    field.select("display", "Show", NUMBER_DISPLAY_OPTIONS, { default: "auto", help: "Balances and portfolios print as a range unless you ask for the exact number." }),
  ],
  size: { default: [2, 1], min: [1, 1], max: [4, 2] },

  render({ inputs, options, area, theme, u }) {
    const raw = inputs.value!.value;
    const num = asType(raw, "number");
    const ser = asType(raw, "series");
    const current = num?.value ?? ser?.points.at(-1)?.v ?? 0;
    const unit = num?.unit ?? ser?.unit;
    const currency = num?.currency ?? ser?.currency;
    const prefix = options.prefix || (unit === "currency" ? currencySymbol(currency) : "");
    const suffix = options.suffix ? ` ${options.suffix}`.replace(/^ (%)/, "$1") : unit === "percent" ? "%" : "";
    const range = showsRange(options.display, inputs.value!.source?.sensitive);
    // A range keeps the owner's own prefix and suffix out: "$1M+" is the whole statement.
    const shown = range ? formatBand({ value: current, unit, currency }) : prefix + formatNumber(current) + suffix;
    const change = ser ? seriesChange(ser) : null;
    const goal = options.goal && options.goal > 0 ? options.goal : null;

    const small = area.height < 90;
    const labelSize = small ? 9 : 11;
    const footer = goal !== null || change !== null;
    const reserved = labelSize * 1.2 + (footer ? labelSize * 1.2 + 14 : 0);
    const valueMax = Math.min(Math.max(6, area.height - reserved - 6), area.height * 0.62, 120);
    const valueSize = fitFont(shown, area.width, valueMax, displayAdvance(theme));

    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(labelSize), lineHeight: 1.2, color: theme.muted, fontFamily: theme.body.family, letterSpacing: u(0.5) }}>{options.label || " "}</Text>
        <Fill style={{ alignItems: "center", paddingBottom: u(footer ? 4 : 0) }}>
          <Text animate={!range}
            style={{
              fontSize: u(valueSize),
              lineHeight: 1,
              color: theme.ink,
              fontFamily: theme.display.family,
              fontWeight: theme.display.weight,
              letterSpacing: u(-valueSize * 0.03),
            }}
          >
            {shown}
          </Text>
        </Fill>
        {goal !== null ? (
          <Col style={{ width: "100%" }}>
            {!range ? <Bar value={current / goal} height={u(small ? 4 : 6)} color={theme.accent} track={theme.track} /> : null}
            <Row style={{ justifyContent: "space-between", marginTop: u(5) }}>
              {/* Goal and percentage together would give the number back. */}
              <Text style={{ fontSize: u(labelSize - 1), lineHeight: 1.2, color: theme.muted }}>{range ? " " : formatPercent(current / goal)}</Text>
              <Text style={{ fontSize: u(labelSize - 1), lineHeight: 1.2, color: theme.muted }}>{prefix + formatNumber(goal) + suffix}</Text>
            </Row>
          </Col>
        ) : change !== null ? (
          <Text style={{ fontSize: u(labelSize), lineHeight: 1.2, color: change >= 0 ? theme.positive : theme.negative }}>
            {`${formatPercent(change, true)} in ${ser!.points.length} days`}
          </Text>
        ) : null}
      </Col>
    );
  },
});
