import { asType, currencySymbol, defineWidget, displayAdvance, field, formatBand, formatNumber, formatPercent, NUMBER_DISPLAY_OPTIONS, seriesChange, showsRange } from "@flexwall/sdk";
import { Col, Fill, Row, Text, fitFont, sparkPoints } from "@flexwall/sdk/ui";

/** A number's recent history as a line, with the latest value and the change. */
export const sparkline = defineWidget<{ label: string; prefix: string; display: string }>({
  id: "sparkline",
  name: "Trend",
  description: "A line chart of a number over time, with its latest value and change.",
  category: "charts",
  inputs: [{ key: "series", label: "History", accepts: ["series"] }],
  options: [
    field.text("label", "Label", { placeholder: "MRR, 30 days", maxLength: 40, optional: true }),
    field.text("prefix", "Before the number", { maxLength: 4, optional: true }),
    field.select("display", "Show", NUMBER_DISPLAY_OPTIONS, { default: "auto", help: "Balances and portfolios print as a range unless you ask for the exact number." }),
  ],
  size: { default: [2, 1], min: [2, 1], max: [4, 2] },

  render({ inputs, options, area, theme, u }) {
    const s = asType(inputs.series!.value, "series")!;
    const values = s.points.map((p) => p.v);
    const last = values.at(-1) ?? 0;
    const change = seriesChange(s);
    const prefix = options.prefix || (s.unit === "currency" ? currencySymbol(s.currency) : "");
    // The line has no axis, so its shape stays: only the printed number becomes a range.
    const shown = showsRange(options.display, inputs.series!.source?.sensitive) ? formatBand({ value: last, unit: s.unit, currency: s.currency }) : prefix + formatNumber(last);
    const valueSize = fitFont(shown, area.width * 0.55, Math.min(area.height * 0.38, 64), displayAdvance(theme));
    const chartHeight = area.height - valueSize - 18;
    const points = sparkPoints(values);

    return (
      <Col style={{ width: "100%", height: "100%" }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Col>
            <Text style={{ fontSize: u(11), color: theme.muted }}>{options.label || " "}</Text>
            <Text style={{ fontSize: u(valueSize), lineHeight: 1.05, color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{shown}</Text>
          </Col>
          {change !== null ? (
            <Text style={{ fontSize: u(12), color: change >= 0 ? theme.positive : theme.negative }}>{formatPercent(change, true)}</Text>
          ) : null}
        </Row>
        <Fill style={{ marginTop: u(6), alignItems: "flex-end" }}>
          {values.length > 1 ? (
            <svg width={u(area.width)} height={u(Math.max(20, chartHeight))} viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={`0,100 ${points} 100,100`} fill={theme.accent} fillOpacity={0.14} />
              <polyline points={points} fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          ) : (
            <Text style={{ fontSize: u(11), color: theme.muted }}>History starts filling in tomorrow.</Text>
          )}
        </Fill>
      </Col>
    );
  },
});

/** Weeks as columns, Sunday on top, like GitHub's graph. Only as many weeks as the tile fits. */
export const heatmap = defineWidget<{ label: string; showTotal: boolean }>({
  id: "heatmap",
  name: "Heatmap",
  description: "Activity per day over the last weeks, GitHub style.",
  category: "charts",
  inputs: [{ key: "days", label: "Activity", accepts: ["calendar"] }],
  options: [field.text("label", "Label", { placeholder: "Commits", maxLength: 40, optional: true }), field.toggle("showTotal", "Show the total", { default: true })],
  size: { default: [4, 1], min: [2, 1], max: [4, 2] },

  render({ inputs, options, area, theme, u }) {
    const days = asType(inputs.days!.value, "calendar")!.days;
    const header = Boolean(options.label || options.showTotal);
    const headerHeight = header ? 20 : 0;
    const rows = 7;
    const gapRatio = 0.22;
    const cell = (area.height - headerHeight) / (rows + (rows - 1) * gapRatio);
    const gap = cell * gapRatio;
    // 2% slack: renderers round each of dozens of cells, and the errors add up at the right edge.
    const weeks = Math.max(1, Math.floor((area.width * 0.98 + gap) / (cell + gap)));

    // Pad the first column so each column starts on Sunday.
    const columns: (typeof days[number] | null)[][] = [];
    let col: (typeof days[number] | null)[] = [];
    for (const d of days) {
      const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
      if (dow === 0 && col.length) {
        columns.push(col);
        col = [];
      }
      if (!col.length && !columns.length) for (let i = 0; i < dow; i++) col.push(null);
      col.push(d);
    }
    if (col.length) columns.push(col);
    const shown = columns.slice(-weeks);
    const total = shown.flat().reduce((sum, d) => sum + (d?.count ?? 0), 0);

    return (
      <Col style={{ width: "100%", height: "100%" }}>
        {header ? (
          <Row style={{ justifyContent: "space-between", height: u(headerHeight), alignItems: "flex-start" }}>
            <Text style={{ fontSize: u(11), color: theme.muted }}>{options.label || " "}</Text>
            {options.showTotal ? <Text style={{ fontSize: u(11), color: theme.ink }}>{`${formatNumber(total)} in ${shown.length} weeks`}</Text> : null}
          </Row>
        ) : null}
        <Row style={{ alignItems: "flex-start", gap: u(gap), justifyContent: "flex-end", flex: 1 }}>
          {shown.map((week, i) => (
            <Col key={i} style={{ gap: u(gap) }}>
              {Array.from({ length: rows }, (_, r) => week[r] ?? null).map((d, j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    width: u(cell),
                    height: u(cell),
                    borderRadius: u(cell * 0.25),
                    background: d ? theme.heat[d.level] : "transparent",
                  }}
                />
              ))}
            </Col>
          ))}
        </Row>
      </Col>
    );
  },
});
