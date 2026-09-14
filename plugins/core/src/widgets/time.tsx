import { daysBetween, defineWidget, displayAdvance, field } from "@flexwall/sdk";
import { Bar, Col, Fill, Row, Text, fitFont } from "@flexwall/sdk/ui";

/** Time widgets take no input: they read the owner's date from `today`. */

export const countdown = defineWidget<{ date: string; label: string }>({
  id: "countdown",
  name: "Countdown",
  description: "Days until a date, or since it.",
  category: "time",
  inputs: [],
  options: [field.date("date", "Date", { defaultInDays: 30 }), field.text("label", "Words after the number", { placeholder: "until launch", maxLength: 40, default: "until launch" })],
  size: { default: [1, 1], min: [1, 1], max: [4, 2] },

  render({ options, area, theme, u, today }) {
    const d = daysBetween(today, options.date);
    const value = d === 0 ? "Today" : d > 0 ? String(d) : `+${-d}`;
    const unit = d === 0 ? "" : Math.abs(d) === 1 ? "day" : "days";
    const words = d < 0 ? `${unit} since` : `${unit} ${options.label || "to go"}`.trim();
    const size = fitFont(value, area.width, area.height * 0.58, displayAdvance(theme));
    const caption = d < 0 && options.label ? `${words} ${options.label}` : words;
    // The caption shrinks before it gets cut: "days until launch" has to fit a one-cell tile.
    const captionSize = fitFont(caption, area.width, area.width < 90 ? 10 : 12, 0.52);
    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Fill style={{ alignItems: "center" }}>
          <Text style={{ fontSize: u(size), lineHeight: 1, color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{value}</Text>
        </Fill>
        <Text style={{ fontSize: u(captionSize), color: theme.muted }}>{caption}</Text>
      </Col>
    );
  },
});

type Period = "year" | "month" | "week";

function progressOf(period: Period, today: string): { done: number; total: number; label: string } {
  const d = new Date(today + "T00:00:00Z");
  const y = d.getUTCFullYear();
  if (period === "year") {
    const total = daysBetween(`${y}-01-01`, `${y + 1}-01-01`);
    return { done: daysBetween(`${y}-01-01`, today) + 1, total, label: String(y) };
  }
  if (period === "month") {
    const total = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
    return { done: d.getUTCDate(), total, label: d.toLocaleString("en-US", { month: "long", timeZone: "UTC" }) };
  }
  const dow = (d.getUTCDay() + 6) % 7; // Monday first
  return { done: dow + 1, total: 7, label: "this week" };
}

export const timeLeft = defineWidget<{ period: Period; style: "bar" | "dots" }>({
  id: "time-left",
  name: "Time left",
  description: "How much of the year, month or week is gone. Bar or dots.",
  category: "time",
  inputs: [],
  options: [
    field.select("period", "Period", [
      { value: "year", label: "Year" },
      { value: "month", label: "Month" },
      { value: "week", label: "Week" },
    ], { default: "year" }),
    field.select("style", "Style", [
      { value: "bar", label: "Bar" },
      { value: "dots", label: "Dots" },
    ], { default: "bar" }),
  ],
  size: { default: [2, 1], min: [1, 1], max: [4, 4] },

  render({ options, area, theme, u, today }) {
    const { done, total, label } = progressOf(options.period ?? "year", today);
    const pct = Math.floor((done / total) * 100);
    const title = `${pct}%`;

    if (options.style === "dots") {
      // Weeks for a year, days otherwise. Columns chosen to fill the width.
      const count = options.period === "year" ? 52 : total;
      const filled = options.period === "year" ? Math.floor((done / total) * 52) : done;
      const cols = Math.ceil(Math.sqrt(count * (area.width / Math.max(1, area.height - 26))));
      const rowsNeeded = Math.ceil(count / cols);
      const dot = Math.min(area.width / (cols * 1.5), (area.height - 26) / (rowsNeeded * 1.5));
      return (
        <Col style={{ width: "100%", height: "100%" }}>
          <Row style={{ justifyContent: "space-between", height: u(22), alignItems: "flex-start" }}>
            <Text style={{ fontSize: u(12), color: theme.ink }}>{title}</Text>
            <Text style={{ fontSize: u(11), color: theme.muted }}>{`of ${label} gone`}</Text>
          </Row>
          <Row style={{ flexWrap: "wrap", gap: u(dot * 0.5), alignItems: "flex-start", alignContent: "flex-start" }}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} style={{ display: "flex", width: u(dot), height: u(dot), borderRadius: u(dot), background: i < filled ? theme.accent : theme.track }} />
            ))}
          </Row>
        </Col>
      );
    }

    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(11), color: theme.muted }}>{`${label}`}</Text>
        <Text style={{ fontSize: u(fitFont(title, area.width, area.height * 0.42, displayAdvance(theme) * 1.15)), lineHeight: 1, color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>
          {title}
        </Text>
        <Bar value={done / total} height={u(6)} color={theme.accent} track={theme.track} />
      </Col>
    );
  },
});
