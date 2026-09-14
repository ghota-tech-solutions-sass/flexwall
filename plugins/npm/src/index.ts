import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, series, type SeriesPoint } from "@flexwall/sdk";

/**
 * Public download counts from npm's downloads API. No account needed.
 *
 * One call to `range/last-month` returns 30 daily counts, which answer every
 * metric: the last 7 days add up to the weekly figure, all 30 to the monthly
 * one, exactly like npm's own `point/last-week` and `point/last-month`.
 */

/** npm's rule for names, plus capitals: legacy packages like JSONStream still have them. */
const PACKAGE_NAME = "^(?:@[A-Za-z0-9~-][A-Za-z0-9._~-]*/)?[A-Za-z0-9~-][A-Za-z0-9._~-]*$";

const packageName = field.text("package", "Package", {
  placeholder: "react",
  maxLength: 214,
  pattern: PACKAGE_NAME,
  patternMessage: "isn't an npm package name",
});

interface RangeResponse {
  start: string;
  end: string;
  package: string;
  downloads: { day: string; downloads: number }[];
}

const sum = (points: readonly SeriesPoint[]) => points.reduce((total, p) => total + p.v, 0);

/** Oldest first, as series values expect. */
export function toPoints(body: RangeResponse): SeriesPoint[] {
  return (body.downloads ?? []).map((d) => ({ t: d.day, v: d.downloads })).sort((a, b) => a.t.localeCompare(b.t));
}

const npmConnector = defineConnector({
  id: "npm",
  name: "npm",
  description: "Weekly, monthly and daily downloads of a public npm package.",
  homepage: "https://www.npmjs.com",
  tier: "free",
  verified: false,
  // npm publishes download counts once a day.
  ttl: 6 * 3600,
  metrics: [
    {
      id: "weekly-downloads",
      name: "Weekly downloads",
      type: "number",
      unit: "count",
      params: [packageName],
      defaults: { label: "weekly downloads" },
      leaderboard: "audience",
    },
    { id: "monthly-downloads", name: "Monthly downloads", type: "number", unit: "count", params: [packageName], defaults: { label: "monthly downloads" } },
    {
      id: "daily-downloads",
      name: "Daily downloads, last 30 days",
      type: "series",
      unit: "count",
      params: [packageName],
      defaults: { label: "Downloads per day" },
    },
  ],

  // One range request answers all three metrics. npm names are case-sensitive
  // (JSONStream and jsonstream are two packages), so the key keeps the case.
  cacheKey: ({ params }) => `package:${String(params.package)}`,

  async fetch({ params }, ctx) {
    const name = String(params.package).trim();
    if (!new RegExp(PACKAGE_NAME).test(name)) throw new ConnectorError(`${name} isn't an npm package name.`);

    let body: RangeResponse;
    try {
      body = await ctx.fetch.json<RangeResponse>(`https://api.npmjs.org/downloads/range/last-month/${name}`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`npm has no package called ${name}.`);
      throw error;
    }

    const points = toPoints(body);
    if (points.length === 0) return { "weekly-downloads": null, "monthly-downloads": null, "daily-downloads": null };
    return {
      "weekly-downloads": number(sum(points.slice(-7)), { unit: "count" }),
      "monthly-downloads": number(sum(points), { unit: "count" }),
      "daily-downloads": series(points, { unit: "count" }),
    };
  },

  sample: (() => {
    const points = sampleDays();
    return {
      "weekly-downloads": number(sum(points.slice(-7)), { unit: "count" }),
      "monthly-downloads": number(sum(points), { unit: "count" }),
      "daily-downloads": series(points, { unit: "count" }),
    };
  })(),
});

/** 30 plausible, deterministic days ending yesterday: busy weekdays, quiet weekends, slow growth. */
function sampleDays(): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const end = new Date();
  for (let i = 30; i >= 1; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const x = Math.sin((31 - i) * 12.9898) * 43758.5453;
    const noise = x - Math.floor(x);
    const base = 7200 + (30 - i) * 40;
    points.push({ t: d.toISOString().slice(0, 10), v: Math.round((weekend ? base * 0.45 : base) * (0.9 + noise * 0.2)) });
  }
  return points;
}

export default definePlugin({
  id: "npm",
  name: "npm",
  description: "Download counts of public npm packages.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [npmConnector],
});

export { npmConnector };
