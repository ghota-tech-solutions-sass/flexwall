import type { Metric, WallConfig } from "@/lib/config";
import { getGithubStats, shiftDate, type ContributionDay, type GithubStats } from "@/lib/sources/github";

/** What the renderer draws for one metric: already formatted, no data fetching left. */
export interface Display {
  value: string;
  label: string;
  /** Right of the value, smaller: "/ $10k". */
  of?: string;
  /** 0–1, draws a bar. */
  progress?: number;
}

export interface Resolved {
  hero: Display;
  stats: Display[];
  heatmap: ContributionDay[] | null;
}

type GithubFetcher = (user: string, today: string) => Promise<GithubStats | null>;

/** Today's date (YYYY-MM-DD) in the owner's zone. */
export function todayIn(tz: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim(n / 1e9) + "B";
  if (abs >= 1e6) return trim(n / 1e6) + "M";
  if (abs >= 1e5) return Math.round(n / 1e3) + "k";
  return Math.round(n).toLocaleString("en-US");
}

/** Short form for the "/ target" part, where space is tight. */
export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e3 && Math.abs(n) < 1e5) return trim(n / 1e3) + "k";
  return formatAmount(n);
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86_400_000);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export async function resolveMetric(metric: Metric, today: string, github: GithubFetcher): Promise<Display> {
  switch (metric.kind) {
    case "countdown": {
      // The label is the owner's phrase ("until launch"); the unit is ours.
      const d = daysBetween(today, metric.date);
      const what = metric.label || "to go";
      if (d === 0) return { value: "Today", label: what };
      const unit = Math.abs(d) === 1 ? "day" : "days";
      if (d > 0) return { value: String(d), label: `${unit} ${what}` };
      return { value: `+${-d}`, label: `${unit} past · ${what}` };
    }
    case "year-progress": {
      const year = Number(today.slice(0, 4));
      const dayOfYear = daysBetween(`${year}-01-01`, today) + 1;
      const p = dayOfYear / (isLeap(year) ? 366 : 365);
      return { value: `${Math.floor(p * 100)}%`, label: `of ${year} gone`, progress: p };
    }
    case "goal": {
      const p = Math.min(1, metric.current / metric.target);
      return {
        value: metric.prefix + formatAmount(metric.current) + metric.suffix,
        of: "/ " + metric.prefix + formatCompact(metric.target) + metric.suffix,
        label: metric.label,
        progress: p,
      };
    }
    case "number":
      return { value: metric.prefix + formatAmount(metric.value) + metric.suffix, label: metric.label };
    case "github-streak": {
      const s = await github(metric.user, today);
      if (!s) return { value: "–", label: `@${metric.user} not found` };
      return { value: String(s.streak), label: `day commit streak` };
    }
    case "github-year": {
      const s = await github(metric.user, today);
      if (!s) return { value: "–", label: `@${metric.user} not found` };
      return { value: formatAmount(s.lastYear), label: "commits, last 12 months" };
    }
  }
}

/**
 * Plausible contribution history for marketing samples, so the landing page
 * never puts a real person's GitHub on show. Deterministic per date.
 */
export const sampleGithub: GithubFetcher = async (user, today) => {
  const days: ContributionDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const x = Math.sin(Number(date.replace(/-/g, "")) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const weekend = [0, 6].includes(new Date(date + "T00:00:00Z").getUTCDay());
    const count = r < (weekend ? 0.45 : 0.12) ? 0 : Math.floor(r * (weekend ? 5 : 14));
    days.push({ date, count, level: count === 0 ? 0 : Math.min(4, 1 + Math.floor(count / 4)) });
  }
  // A clean recent run: the streak is the point of the sample.
  for (let i = 0; i < 47; i++) {
    const d = days[days.length - 1 - i];
    if (d.count === 0) Object.assign(d, { count: 3, level: 1 });
  }
  return { user, days, lastYear: days.reduce((s, d) => s + d.count, 0), streak: 47 };
};

export async function resolveWall(config: WallConfig, now = new Date(), github: GithubFetcher = getGithubStats): Promise<Resolved> {
  const today = todayIn(config.tz, now);
  const [hero, stats, heat] = await Promise.all([
    resolveMetric(config.hero, today, github),
    Promise.all(config.stats.map((m) => resolveMetric(m, today, github))),
    config.heatmap ? github(config.heatmap, today) : Promise.resolve(null),
  ]);
  return { hero, stats, heatmap: heat ? heat.days.filter((d) => d.date <= today) : null };
}
