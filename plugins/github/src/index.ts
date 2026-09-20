import { calendar, ConnectorError, defineConnector, definePlugin, field, HttpError, number, series, type CalendarDay, type ConnectorContext } from "@flexwall/sdk";

/**
 * Public GitHub numbers. No account needed: the contribution calendar is the
 * fragment every profile page loads, and users/repos come from the REST API
 * (60 calls an hour per server IP, 5000 with the host's GITHUB_TOKEN).
 */

const user = field.text("user", "GitHub username", {
  placeholder: "torvalds",
  maxLength: 39,
  pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$",
  patternMessage: "isn't a valid GitHub username",
});

const repo = field.text("repo", "Repository", {
  placeholder: "vercel/next.js",
  maxLength: 140,
  pattern: "^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$",
  patternMessage: "must look like owner/name",
});

export function parseContributions(html: string): CalendarDay[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    const n = /^([\d,]+) contributions? on/.exec(m[2].trim());
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days: CalendarDay[] = [];
  for (const m of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const tag = m[0];
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
    const level = Math.min(4, Number(/data-level="(\d)"/.exec(tag)?.[1] ?? "0")) as CalendarDay["level"];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    if (!date) continue;
    const count = id && counts.has(id) ? counts.get(id)! : level > 0 ? 1 : 0;
    days.push({ date, count, level });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** Consecutive active days ending today, or yesterday: a 7am render shouldn't break a streak nobody could extend yet. */
export function currentStreak(days: readonly CalendarDay[], today: string): number {
  const active = new Set(days.filter((d) => d.count > 0).map((d) => d.date));
  const shift = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  let cursor = active.has(today) ? today : shift(today);
  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    cursor = shift(cursor);
  }
  return streak;
}

async function api<T>(ctx: ConnectorContext, path: string): Promise<T> {
  const token = ctx.env("GITHUB_TOKEN");
  try {
    return await ctx.fetch.json<T>(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`GitHub has no ${path.startsWith("/repos") ? "repository" : "user"} called ${path.split("/").slice(2).join("/")}.`);
    throw error;
  }
}

/** Default-branch commits grouped by UTC committer date; never returns a truncated total. */
export async function repositoryActivity(ctx: ConnectorContext, repository: string) {
  const end = new Date(`${ctx.today}T00:00:00Z`).getTime();
  const days = Array.from({ length: 30 }, (_, i) => new Date(end - (29 - i) * 86400000).toISOString().slice(0, 10));
  const counts = new Map(days.map((day) => [day, 0]));
  const seen = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const query = new URLSearchParams({ since: `${days[0]}T00:00:00Z`, until: `${ctx.today}T23:59:59Z`, per_page: "100", page: String(page) });
    let commits: { sha: string; commit: { committer: { date: string } } }[];
    try { commits = await api(ctx, `/repos/${repository}/commits?${query}`); }
    catch (error) { if (error instanceof HttpError && error.status === 409) break; throw error; }
    for (const commit of commits) {
      const day = commit.commit.committer.date.slice(0, 10);
      if (!seen.has(commit.sha) && counts.has(day)) counts.set(day, counts.get(day)! + 1);
      seen.add(commit.sha);
    }
    if (commits.length < 100) break;
    if (page === 20) throw new ConnectorError("This repository exceeds 2,000 commits in 30 days. No partial total is shown.");
  }
  const points = days.map((t) => ({ t, v: counts.get(t)! }));
  return { "commits-30d": number(points.reduce((sum, p) => sum + p.v, 0), { unit: "count" }), "commits-daily": series(points, { unit: "count" }) };
}

const githubConnector = defineConnector({
  id: "github",
  name: "GitHub",
  description: "Commit streaks, contribution graphs, followers and stars from public profiles.",
  homepage: "https://github.com",
  icon: "M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.34 9.34 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z",
  tier: "free",
  verified: false,
  ttl: 3600,

  // GITHUB_TOKEN only raises the rate limit, so this connector works without one.
  server: (ctx) => ({ configured: true, environment: "production", detail: ctx.env("GITHUB_TOKEN") ? "GITHUB_TOKEN set: 5,000 requests an hour" : "no GITHUB_TOKEN: 60 requests an hour" }),

  metrics: [
    { id: "streak", name: "Commit streak", type: "number", unit: "count", params: [user], defaults: { label: "day streak" }, leaderboard: "streak" },
    { id: "contributions", name: "Contributions, last 12 months", type: "number", unit: "count", params: [user], defaults: { label: "contributions this year" } },
    { id: "activity", name: "Contribution graph", type: "calendar", params: [user], defaults: { label: "Contributions" } },
    { id: "followers", name: "Followers", type: "number", unit: "count", params: [user], defaults: { label: "GitHub followers" } },
    { id: "commits-30d", name: "Repository commits, last 30 days", type: "number", unit: "count", params: [repo], defaults: { label: "Commits, 30 days" } },
    { id: "commits-daily", name: "Daily repository commits, last 30 days", type: "series", unit: "count", params: [repo], defaults: { label: "Daily commits" } },
    { id: "stars", name: "Repository stars", type: "number", unit: "count", params: [repo], defaults: { label: "stars" }, leaderboard: "stars" },
  ],

  // One calendar page answers streak, contributions and activity for a user.
  cacheKey({ metric, params }) {
    if (metric.startsWith("commits-")) return `commits:${String(params.repo).toLowerCase()}`;
    if (metric === "stars") return `repo:${String(params.repo).toLowerCase()}`;
    if (metric === "followers") return `user:${String(params.user).toLowerCase()}`;
    return `calendar:${String(params.user).toLowerCase()}`;
  },

  async fetch({ metrics, params }, ctx) {
    if (metrics.some((m) => m.startsWith("commits-"))) return repositoryActivity(ctx, String(params.repo));
    if (metrics.includes("stars")) {
      const r = await api<{ stargazers_count: number }>(ctx, `/repos/${params.repo}`);
      return { stars: number(r.stargazers_count, { unit: "count" }) };
    }
    if (metrics.includes("followers")) {
      const u = await api<{ followers: number }>(ctx, `/users/${encodeURIComponent(String(params.user))}`);
      return { followers: number(u.followers, { unit: "count" }) };
    }
    let html: string;
    try {
      html = await ctx.fetch.text(`https://github.com/users/${encodeURIComponent(String(params.user))}/contributions`, { maxBytes: 2_000_000 });
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`GitHub has no user called ${params.user}.`);
      throw error;
    }
    const days = parseContributions(html).filter((d) => d.date <= ctx.today);
    if (days.length === 0) throw new Error("GitHub's contribution page changed shape: no days found");
    return {
      streak: number(currentStreak(days, ctx.today), { unit: "count" }),
      contributions: number(days.reduce((s, d) => s + d.count, 0), { unit: "count" }),
      activity: calendar(days),
    };
  },

  sample: {
    streak: number(47, { unit: "count" }),
    contributions: number(1834, { unit: "count" }),
    activity: calendar(sampleDays()),
    followers: number(1613, { unit: "count" }),
    stars: number(2410, { unit: "count" }),
    "commits-30d": number(90, { unit: "count" }),
    "commits-daily": series(Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10), v: 3 })), { unit: "count" }),
  },
});

/** A plausible, deterministic year of activity ending today. */
function sampleDays(): CalendarDay[] {
  const days: CalendarDay[] = [];
  const end = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const x = Math.sin((365 - i) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const count = i < 47 ? 2 + Math.floor(r * 9) : r < (weekend ? 0.5 : 0.15) ? 0 : Math.floor(r * 12);
    days.push({ date, count, level: (count === 0 ? 0 : Math.min(4, 1 + Math.floor(count / 3))) as CalendarDay["level"] });
  }
  return days;
}

export default definePlugin({
  id: "github",
  name: "GitHub",
  description: "Streaks, contribution graphs, followers and stars.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [githubConnector],
});

export { githubConnector };
