import { asType, defineWidget, field, formatNumber, formatPercent, seriesChange, currencySymbol } from "@flexwall/sdk";
import { Bar, Col, Fill, Row, Text, fitFont } from "@flexwall/sdk/ui";

type Options = { label: string; prefix: string; suffix: string; goal?: number };

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
    const shown = prefix + formatNumber(current) + suffix;
    const change = ser ? seriesChange(ser) : null;
    const goal = options.goal && options.goal > 0 ? options.goal : null;

    const small = area.height < 90;
    const labelSize = small ? 10 : 12;
    const footer = goal !== null || change !== null;
    const valueMax = Math.min(area.height * (footer ? 0.5 : 0.62), 120);
    const valueSize = fitFont(shown, area.width, valueMax, theme.display.family === "Mono" ? 0.62 : 0.56);

    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(labelSize), color: theme.muted, fontFamily: theme.body.family }}>{options.label || " "}</Text>
        <Fill style={{ alignItems: "center" }}>
          <Text
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
            <Bar value={current / goal} height={u(small ? 5 : 7)} color={theme.accent} track={theme.track} />
            <Row style={{ justifyContent: "space-between", marginTop: u(5) }}>
              <Text style={{ fontSize: u(labelSize - 1), color: theme.muted }}>{formatPercent(current / goal)}</Text>
              <Text style={{ fontSize: u(labelSize - 1), color: theme.muted }}>{prefix + formatNumber(goal) + suffix}</Text>
            </Row>
          </Col>
        ) : change !== null ? (
          <Text style={{ fontSize: u(labelSize), color: change >= 0 ? theme.positive : theme.negative }}>
            {`${formatPercent(change, true)} in ${ser!.points.length} days`}
          </Text>
        ) : null}
      </Col>
    );
  },
});
