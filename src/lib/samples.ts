import { encodeConfig, type Metric, type ThemeId, type WallConfig } from "@/lib/config";

/** Sample countdowns stay in the future whenever the page is rendered. */
function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A connector metric for samples: connectors answer with their sample numbers, nothing is fetched. */
function connector(
  source: string,
  field: string,
  display: { label: string; prefix?: string; suffix?: string; target?: number },
  params: Record<string, string> = {}
): Metric {
  return { kind: "connector", source, field, params, connection: "", prefix: "", suffix: "", ...display };
}

/** Landing page wallpapers. The heatmap user is ignored: samples render with synthetic history. */
export const SAMPLES: Record<ThemeId, WallConfig> = {
  ink: {
    device: "iphone-17-pro",
    theme: "ink",
    caption: "building in public",
    hero: connector("stripe", "mrr", { label: "MRR", prefix: "$", target: 10000 }),
    stats: [
      connector("github", "streak", { label: "day commit streak" }, { user: "sample" }),
      { kind: "countdown", label: "until launch", date: inDays(43) },
    ],
    heatmap: "sample",
    tz: "UTC",
  },
  gold: {
    device: "iphone-17-pro",
    theme: "gold",
    caption: "Year one",
    hero: { kind: "number", label: "saved this year", value: 18400, prefix: "€", suffix: "" },
    stats: [{ kind: "year-progress" }, { kind: "goal", label: "to 25k", current: 18400, target: 25000, prefix: "€", suffix: "" }],
    heatmap: "",
    tz: "UTC",
  },
  terminal: {
    device: "iphone-17-pro",
    theme: "terminal",
    caption: "~/ship-it",
    hero: connector("github", "streak", { label: "day commit streak" }, { user: "sample" }),
    stats: [
      connector("github", "stars", { label: "GitHub stars" }, { repo: "sample/repo" }),
      { kind: "number", label: "open PRs", value: 3, prefix: "", suffix: "" },
    ],
    heatmap: "sample",
    tz: "UTC",
  },
  sunset: {
    device: "iphone-17-pro",
    theme: "sunset",
    caption: "road to 10k",
    hero: connector("http", "value", { label: "followers on X", target: 10000 }),
    stats: [
      { kind: "countdown", label: "left in the challenge", date: inDays(108) },
      { kind: "year-progress" },
    ],
    heatmap: "",
    tz: "UTC",
  },
  paper: {
    device: "iphone-17-pro",
    theme: "paper",
    caption: "Marathon block",
    hero: { kind: "countdown", label: "to race day", date: inDays(48) },
    stats: [
      { kind: "goal", label: "km this month", current: 142, target: 220, prefix: "", suffix: "" },
      { kind: "year-progress" },
    ],
    heatmap: "",
    tz: "UTC",
  },
  serif: {
    device: "iphone-17-pro",
    theme: "serif",
    caption: "The novel",
    hero: { kind: "goal", label: "words written", current: 61250, target: 90000, prefix: "", suffix: "" },
    stats: [{ kind: "countdown", label: "to the deadline", date: inDays(123) }],
    heatmap: "",
    tz: "UTC",
  },
};

export const SAMPLE_ORDER: ThemeId[] = ["ink", "terminal", "sunset", "gold", "paper", "serif"];

export function samplePreviewUrl(theme: ThemeId, width = 603): string {
  return `/api/preview?sample=1&w=${width}&c=${encodeConfig(SAMPLES[theme])}`;
}
