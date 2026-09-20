import { asType, currencySymbol, defineWidget, field, formatBand, formatNumber, NUMBER_DISPLAY_OPTIONS, showsRange } from "@flexwall/sdk";
import { Col, Row, Text, fitFont } from "@flexwall/sdk/ui";

/** A zero-inclusive scale: negative bars point below the same baseline. */
export function chartGeometry(values: readonly number[]) {
  const magnitude = Math.max(1, ...values.map(Math.abs));
  const normalized = values.map((v) => v / magnitude);
  const min = Math.min(0, ...normalized);
  const max = Math.max(0, ...normalized);
  const span = max - min || 1;
  const y = (v: number) => 94 - ((v / magnitude - min) / span) * 88;
  return { zero: y(0), points: values.map((v, i) => ({ x: values.length === 1 ? 50 : (i / (values.length - 1)) * 100, y: y(v) })) };
}

const historyOptions = [
  field.text("label", "Label", { maxLength: 40, optional: true }),
  field.select("display", "Show", NUMBER_DISPLAY_OPTIONS, { default: "auto" }),
  field.select("summary", "Headline value", [{ value: "latest", label: "Latest observation" }, { value: "sum", label: "Total of the displayed period" }], { default: "latest", help: "Use a total for daily revenue or visits, not balances or unique visitors." }),
];

function historyChart(id: string, name: string, description: string, bars: boolean) {
  return defineWidget<{ label: string; display: string; summary: string }>({
    id, name, description, category: "charts",
    inputs: [{ key: "series", label: "History", accepts: ["series"] }],
    options: historyOptions,
    size: { default: [2, 2], min: [2, 1], max: [4, 3] },
    render({ inputs, options, area, theme, u, surface }) {
      const s = asType(inputs.series!.value, "series")!;
      // Keep individual observations intact rather than silently aggregating different metrics.
      const points = s.points.slice(-30);
      const values = points.map((p) => p.v);
      const last = values.length ? options.summary === "sum" ? values.reduce((sum, value) => sum + value, 0) : values.at(-1) : undefined;
      const range = showsRange(options.display, inputs.series!.source?.sensitive);
      const shown = last === undefined ? "No history yet" : range ? formatBand({ value: last, unit: s.unit, currency: s.currency }) : (s.unit === "currency" ? currencySymbol(s.currency) : "") + formatNumber(last);
      const geometry = chartGeometry(values);
      const path = geometry.points.map((p, i) => i ? `H ${p.x} V ${p.y}` : `M ${p.x} ${p.y}`).join(" ");
      const height = Math.max(12, area.height - 38);
      return <Col style={{ width: "100%", height: "100%" }}>
        <Row style={{ height: u(24), flexShrink: 0, justifyContent: "space-between", gap: u(6) }}>
          <Text style={{ fontSize: u(fitFont(options.label || name, area.width * 0.52, 10)), color: theme.muted }}>{options.label || name}</Text>
          <Text animate={!range} style={{ fontSize: u(fitFont(shown, area.width * 0.42, 21)), fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{shown}</Text>
        </Row>
        {points.length ? <svg width={u(area.width)} height={u(height)} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ marginTop: u(3), flexShrink: 0 }}>
          {[28, 60].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={theme.track} strokeWidth="0.5" strokeDasharray="2 3" />)}
          <line x1="0" y1={geometry.zero} x2="100" y2={geometry.zero} stroke={theme.track} strokeWidth="1" />
          {bars ? geometry.points.map((point, i) => <rect key={i} x={i * 100 / points.length + 1} y={Math.min(point.y, geometry.zero)} width={Math.max(0.5, 100 / points.length - 2)} height={Math.abs(point.y - geometry.zero)} fill={values[i] < 0 ? theme.negative : theme.accent} opacity={i === points.length - 1 ? 1 : 0.35 + (i / Math.max(1, points.length - 1)) * 0.4} rx="1.2" />) : points.length === 1 ? <line x1="0" y1={geometry.points[0].y} x2="100" y2={geometry.points[0].y} stroke={theme.accent} strokeWidth="2" /> : <path d={path} fill="none" stroke={theme.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          {surface === "page" ? points.map((point, i) => {
            const value = range ? formatBand({ value: point.v, unit: s.unit, currency: s.currency }) : (s.unit === "currency" ? currencySymbol(s.currency) : "") + point.v.toLocaleString("en-US", { maximumFractionDigits: 8 });
            const label = `${point.t} · ${value}${s.unit === "percent" ? "%" : ""}`;
            return <rect key={`hit-${i}`} data-chart-point={label} role="img" aria-label={label} tabIndex={i === 0 ? 0 : -1} x={i * 100 / points.length} y="0" width={100 / points.length} height="100" fill="transparent" style={{ cursor: "crosshair" }}><title>{label}</title></rect>;
          }) : null}
        </svg> : <Text style={{ fontSize: u(10), color: theme.muted, marginTop: u(8) }}>Connect a history source to get started.</Text>}
        {points.length ? <Row style={{ justifyContent: "space-between", height: u(8), flexShrink: 0, lineHeight: 1, marginTop: u(3), fontSize: u(8), color: theme.muted }}><Text>{points[0].t.slice(5)}</Text><Text>{points.at(-1)!.t.slice(5)}</Text></Row> : null}
      </Col>;
    },
  });
}

export const barChart = historyChart("bar-chart", "Bars", "Compare the last 30 observations with a zero baseline. Negative values extend below zero.", true);
export const stepChart = historyChart("step-chart", "Steps", "A stepped history for counts and milestones. Shows the last 30 observations.", false);

export const goalRing = defineWidget<{ label: string; goal: number; display: string }>({
  id: "goal-ring", name: "Goal ring", description: "A circular progress chart toward a target, with your current value.", category: "progress",
  inputs: [{ key: "value", label: "Number", accepts: ["number"] }],
  options: [field.text("label", "Label", { maxLength: 40, optional: true }), field.number("goal", "Target", { min: 1, default: 1000 }), field.select("display", "Show", NUMBER_DISPLAY_OPTIONS, { default: "auto" })],
  size: { default: [2, 2], min: [1, 1], max: [3, 3] },
  render({ inputs, options, area, theme, u, surface }) {
    const value = asType(inputs.value!.value, "number")!;
    const privateValue = showsRange(options.display, inputs.value!.source?.sensitive);
    const validGoal = Number.isFinite(options.goal) && options.goal > 0;
    const progress = validGoal ? Math.max(0, Math.min(1, value.value / options.goal)) : 0;
    const shown = privateValue ? formatBand(value) : (value.unit === "currency" ? currencySymbol(value.currency) : "") + formatNumber(value.value);
    const diameter = Math.max(16, Math.min(area.width, area.height - 24));
    const circumference = 2 * Math.PI * 40;
    return <Col style={{ width: "100%", height: "100%", alignItems: "center", gap: u(3) }}>
      <Text style={{ fontSize: u(10), color: theme.muted }}>{options.label || "Goal"}</Text>
      <div style={{ display: "flex", position: "relative", width: u(diameter), height: u(diameter), alignItems: "center", justifyContent: "center" }}>
        <svg width={u(diameter)} height={u(diameter)} viewBox="0 0 100 100" style={{ position: "absolute", top: 0, left: 0 }}>
          <circle cx="50" cy="50" r="40" fill="none" stroke={theme.track} strokeWidth="6" />
          {!privateValue && validGoal ? <circle data-progress-ring="true" cx="50" cy="50" r="40" fill="none" stroke={theme.accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 50 50)" /> : null}
        </svg>
        <Text animate={!privateValue} style={{ fontSize: u(fitFont(shown, diameter * 0.68, diameter * 0.2)), fontWeight: theme.display.weight, fontFamily: theme.display.family }}>{shown}</Text>
      </div>
      <Text style={{ fontSize: u(8), color: theme.muted }}>{privateValue ? "Progress hidden for privacy" : validGoal ? `${formatNumber(value.value / options.goal * 100)}% of ${formatNumber(options.goal)}` : "Set a positive target"}</Text>
    </Col>;
  },
});
