/**
 * GitHub contributions, read from the public calendar fragment
 * (github.com/users/<user>/contributions) — the same HTML the profile page
 * embeds. No token, no user credentials. Cached per user for a few hours in
 * process memory: a wallpaper refreshes once a day, the editor preview many
 * times a minute.
 */

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: number; // 0–4, GitHub's own bucket
}

export interface GithubStats {
  user: string;
  days: ContributionDay[]; // oldest → newest
  lastYear: number;
  streak: number;
}

const TTL_MS = 3 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { at: number; stats: GithubStats | null };
const g = globalThis as unknown as { __fwGithub?: Map<string, CacheEntry> };
const cache = (g.__fwGithub ??= new Map());

export function parseContributions(html: string): ContributionDay[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    const text = m[2].trim();
    const n = /^([\d,]+) contributions? on/.exec(text);
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days: ContributionDay[] = [];
  for (const m of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const tag = m[0];
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1] ?? "0");
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    if (!date) continue;
    // Days with a level but no readable tooltip still count as "some" activity.
    const count = id && counts.has(id) ? counts.get(id)! : level > 0 ? 1 : 0;
    days.push({ date, count, level });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

/**
 * Consecutive active days ending today — or yesterday, so a 7am wallpaper
 * doesn't show a broken streak before the owner has had a chance to commit.
 */
export function currentStreak(days: ContributionDay[], today: string): number {
  const active = new Set(days.filter((d) => d.count > 0).map((d) => d.date));
  let cursor = today;
  if (!active.has(cursor)) cursor = shiftDate(cursor, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function getGithubStats(user: string, today: string): Promise<GithubStats | null> {
  const key = user.toLowerCase();
  const hit = cache.get(key);
  const now = Date.now();
  let days: ContributionDay[] | null = null;
  if (hit && now - hit.at < (hit.stats ? TTL_MS : MISS_TTL_MS)) {
    days = hit.stats?.days ?? null;
  } else {
    days = await fetchDays(user);
    cache.set(key, { at: now, stats: days ? summarize(user, days, today) : null });
  }
  return days ? summarize(user, days, today) : null;
}

function summarize(user: string, days: ContributionDay[], today: string): GithubStats {
  return {
    user,
    days,
    lastYear: days.reduce((sum, d) => sum + d.count, 0),
    streak: currentStreak(days, today),
  };
}

async function fetchDays(user: string): Promise<ContributionDay[] | null> {
  try {
    const res = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`, {
      headers: { "User-Agent": "flexwall.lol wallpaper renderer", Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const days = parseContributions(await res.text());
    return days.length > 0 ? days : null;
  } catch (error) {
    console.error(`github fetch failed for ${user}:`, error);
    return null;
  }
}
