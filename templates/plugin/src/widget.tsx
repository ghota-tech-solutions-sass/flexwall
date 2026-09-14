import { asType, defineWidget, field, formatNumber } from "@flexwall/sdk";
import { Col, Text, fitFont } from "@flexwall/sdk/ui";

/** An example widget. Delete this file if your plugin only adds a connector. */
export const __CAMEL__Widget = defineWidget<{ label: string }>({
  id: "__ID__-big-number",
  name: "__NAME__ number",
  description: "One number, as big as the tile allows.",
  category: "numbers",
  inputs: [{ key: "value", label: "Number", accepts: ["number"] }],
  options: [field.text("label", "Label", { maxLength: 40, optional: true })],
  size: { default: [1, 1], min: [1, 1], max: [2, 2] },

  render({ inputs, options, area, theme, u }) {
    const value = asType(inputs.value!.value, "number");
    const shown = value ? formatNumber(value.value) : "–";
    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(11), color: theme.muted }}>{options.label || " "}</Text>
        <Text style={{ fontSize: u(fitFont(shown, area.width, area.height * 0.6)), color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>
          {shown}
        </Text>
      </Col>
    );
  },
});
