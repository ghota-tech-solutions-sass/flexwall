import {
  calendar,
  ConnectorError,
  defineConnector,
  definePlugin,
  field,
  HttpError,
  number,
  type CalendarDay,
  type ConnectorContext,
  type FetchResult,
  type NumberValue,
} from "@flexwall/sdk";

/**
 * Coding time from the owner's WakaTime account, read with their secret API
 * key. One summaries request (daily totals over the last 30 days) answers the
 * 7-day numbers, the activity graph and the streak; all-time is a second
 * request, made only when a tile shows it.
 */

const API = "https://wakatime.com/api/v1";

/** Days of summaries asked for. Free accounts may be limited to a week of history: see `summaries`. */
export const HISTORY_DAYS = 30;
export const FREE_HISTORY_DAYS = 7;

const SUMMARY_METRICS = new Set(["coding-7d", "daily-average-7d", "activity", "streak"]);

/** The slice of `GET /users/current/summaries` this connector reads. */
export interface SummariesResponse {
  data: { grand_total?: { total_seconds?: number }; range?: { date?: string } }[];
}

/** The slice of `GET /users/current/all_time_since_today`. */
export interface AllTimeResponse {
  data?: { total_seconds?: number; is_up_to_date?: boolean; percent_calculated?: number };
}

/** The slice of `GET /users/current`. */
export interface CurrentUserResponse {
  data: { id: string; username?: string | null; display_name?: string | null };
}

/** One day of coding: the date and seconds of coding time. */
export interface CodingDay {
  date: string;
  seconds: number;
}

/** `iso` moved by `days`, both YYYY-MM-DD. */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Seconds as hours, one decimal. The SDK declares a "duration" unit but no
 * widget formats it yet, so coding time is shown as a count of hours.
 */
export function toHours(seconds: number): number {
  return Math.round(seconds / 360) / 10;
}

const hours = (seconds: number): NumberValue => number(toHours(seconds), { unit: "count" });

/** Daily totals from a summaries response, oldest first, never after today. */
export function codingDays(response: SummariesResponse, today: string): CodingDay[] {
  const byDate = new Map<string, number>();
  for (const day of response.data ?? []) {
    const date = day.range?.date;
    if (!date || date > today) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + Math.max(0, day.grand_total?.total_seconds ?? 0));
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, seconds]) => ({ date, seconds }));
}

/** Coding time over the 7 days ending today, and WakaTime's kind of daily average: divided by the days with coding time. */
export function lastSevenDays(days: readonly CodingDay[], today: string): { total: number; average: number } {
  const from = shiftDate(today, -6);
  const week = days.filter((d) => d.date >= from && d.date <= today);
  const total = week.reduce((sum, d) => sum + d.seconds, 0);
  const active = week.filter((d) => d.seconds > 0).length;
  return { total, average: active ? total / active : 0 };
}

/**
 * Consecutive days with coding time ending today, or yesterday: a morning
 * render shouldn't break a streak nobody could extend yet. Counts only the days
 * WakaTime returned, so it can't be longer than the history window.
 */
export function currentStreak(days: readonly CodingDay[], today: string): number {
  const active = new Set(days.filter((d) => d.seconds > 0).map((d) => d.date));
  let cursor = active.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

/** Heat levels by hours of coding: none, under 1 h, under 2 h, under 4 h, 4 h or more. */
export function levelFor(seconds: number): CalendarDay["level"] {
  if (seconds <= 0) return 0;
  if (seconds < 3600) return 1;
  if (seconds < 7200) return 2;
  if (seconds < 14400) return 3;
  return 4;
}

function authorization(key: string): Record<string, string> {
  // WakaTime's Basic auth is the key alone, base64 encoded: "12345" → "Basic MTIzNDU=".
  return { Authorization: `Basic ${btoa(key)}` };
}

function refusedKey(error: unknown): never {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    throw new ConnectorError("WakaTime refused the API key, so it may have been regenerated: connect WakaTime again with the new one.");
  }
  // 429, outages, and the 302 WakaTime sometimes sends instead of a 429 (a blocked redirect) go through.
  throw error;
}

/**
 * The last 30 days of summaries. WakaTime's free plan keeps a week of
 * dashboard history; if the API refuses the longer range with 402 Payment
 * Required, ask for the last 7 days instead.
 */
async function summaries(ctx: ConnectorContext, key: string): Promise<{ days: CodingDay[]; window: number }> {
  const load = (window: number) =>
    ctx.fetch.json<SummariesResponse>(`${API}/users/current/summaries?start=${shiftDate(ctx.today, -(window - 1))}&end=${ctx.today}`, {
      headers: authorization(key),
      timeoutMs: 10_000,
      maxBytes: 4_000_000,
    });
  try {
    return { days: codingDays(await load(HISTORY_DAYS), ctx.today), window: HISTORY_DAYS };
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 402)) refusedKey(error);
  }
  try {
    return { days: codingDays(await load(FREE_HISTORY_DAYS), ctx.today), window: FREE_HISTORY_DAYS };
  } catch (error) {
    if (error instanceof HttpError && error.status === 402) throw new ConnectorError("WakaTime says this account's plan doesn't include its recent coding history.");
    refusedKey(error);
  }
}

const wakatimeConnector = defineConnector({
  id: "wakatime",
  name: "WakaTime",
  description: "Coding time, streak and activity from your WakaTime account.",
  homepage: "https://wakatime.com",
  tier: "free",
  verified: true,
  // WakaTime asks for under 10 requests a second; coding time moves through the day.
  ttl: 900,
  auth: {
    label: "Connect WakaTime",
    help: "In WakaTime, open Settings → Account → API Key (wakatime.com/api-key) and copy your secret API key. WakaTime has no read-only keys: this key gives full access to your account, including writing and deleting coding activity. WakaTime's read-only OAuth scopes can't be used with a pasted key. To cut Flexwall off later, regenerate the key in WakaTime (your editors will need the new one too).",
    fields: [field.secret("key", "Secret API key", { placeholder: "waka_…", maxLength: 200, pattern: "^\\S+$", patternMessage: "can't contain spaces" })],
  },
  metrics: [
    { id: "coding-7d", name: "Coding time, last 7 days", description: "Hours of coding over the 7 days ending today.", type: "number", unit: "count", defaults: { label: "hours coding, last 7 days" } },
    {
      id: "daily-average-7d",
      name: "Daily average, last 7 days",
      description: "Hours a day over the last 7 days, counting only days with coding time, like WakaTime's dashboard.",
      type: "number",
      unit: "count",
      defaults: { label: "hours a day, 7-day average" },
    },
    { id: "all-time", name: "Coding time, all time", description: "Hours of coding since the WakaTime account was created.", type: "number", unit: "count", defaults: { label: "hours coding, all time" } },
    { id: "activity", name: "Coding activity", description: "Hours of coding per day over the last 30 days, or less when WakaTime keeps less history.", type: "calendar", defaults: { label: "Coding hours" } },
    { id: "streak", name: "Coding streak", description: "Consecutive days with coding time, up to today. Capped by the history WakaTime returns.", type: "number", unit: "count", defaults: { label: "day coding streak" } },
  ],

  // One summaries request answers everything but all-time, which is its own request.
  cacheKey: ({ metric }) => (metric === "all-time" ? "all-time" : "summaries"),

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.key) return {};
    const out: FetchResult = {};

    if (metrics.some((m) => SUMMARY_METRICS.has(m))) {
      const { days, window } = await summaries(ctx, secret.key);
      const week = lastSevenDays(days, ctx.today);
      const streak = currentStreak(days, ctx.today);
      const streakStart = shiftDate(days.some((d) => d.date === ctx.today && d.seconds > 0) ? ctx.today : shiftDate(ctx.today, -1), -(streak - 1));
      if (streak > 0 && shiftDate(streakStart, -1) < days[0].date) ctx.log(`wakatime: a ${streak}-day streak reaches the start of the ${window}-day history, so it's a floor`);
      out["coding-7d"] = hours(week.total);
      out["daily-average-7d"] = hours(week.average);
      out.streak = number(streak, { unit: "count" });
      out.activity = calendar(days.map((d) => ({ date: d.date, count: toHours(d.seconds), level: levelFor(d.seconds) })));
    }

    if (metrics.includes("all-time")) {
      let body: AllTimeResponse;
      try {
        // WakaTime answers 202 with is_up_to_date false while it calculates; that's still a 2xx.
        body = await ctx.fetch.json<AllTimeResponse>(`${API}/users/current/all_time_since_today`, { headers: authorization(secret.key) });
      } catch (error) {
        refusedKey(error);
      }
      const data = body.data;
      const calculating = data?.is_up_to_date === false && (data.percent_calculated ?? 0) < 100;
      out["all-time"] = !calculating && typeof data?.total_seconds === "number" ? hours(data.total_seconds) : null;
    }

    return out;
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    let me: CurrentUserResponse;
    try {
      me = await ctx.fetch.json<CurrentUserResponse>(`${API}/users/current`, { headers: authorization(key) });
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw new ConnectorError("WakaTime refused this API key.");
      throw error;
    }
    const name = me.data.username ? `@${me.data.username}` : me.data.display_name || "WakaTime account";
    return {
      secret: { key },
      public: { hint: `…${key.slice(-4)}`, account: name },
      label: `WakaTime (${name})`,
      accountId: me.data.id,
    };
  },

  sample: {
    "coding-7d": number(23.4, { unit: "count" }),
    "daily-average-7d": number(4.7, { unit: "count" }),
    "all-time": number(1843.5, { unit: "count" }),
    activity: calendar(sampleDays()),
    streak: number(12, { unit: "count" }),
  },
});

/** A plausible, deterministic month of coding ending today, with the last 12 days all active. */
function sampleDays(): CalendarDay[] {
  const today = new Date().toISOString().slice(0, 10);
  return Array.from({ length: HISTORY_DAYS }, (_, n) => {
    const i = HISTORY_DAYS - 1 - n;
    const date = shiftDate(today, -i);
    const x = Math.sin((n + 1) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const seconds = i < 12 ? 1800 + Math.floor(r * 5 * 3600) : r < 0.3 ? 0 : Math.floor(r * 6 * 3600);
    return { date, count: toHours(seconds), level: levelFor(seconds) };
  });
}

export default definePlugin({
  id: "wakatime",
  name: "WakaTime",
  description: "Coding time, streak and activity from WakaTime.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [wakatimeConnector],
});

export { wakatimeConnector };
