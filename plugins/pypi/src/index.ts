import { ConnectorError, defineConnector, definePlugin, field, HttpError, number } from "@flexwall/sdk";

/**
 * Public download counts of PyPI packages, from pypistats.org. No account needed.
 *
 * One `recent` request answers the last day, week and month. pypistats runs on
 * limited resources, updates once a day and asks callers to cache: hence the
 * long ttl and the shared cache key.
 */

/** PEP 508 names: letters, digits, and . _ - inside. Case doesn't matter. */
const PACKAGE_NAME = "^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$";

const packageName = field.text("package", "Package", {
  placeholder: "requests",
  maxLength: 128,
  pattern: PACKAGE_NAME,
  patternMessage: "isn't a PyPI package name",
});

/** PEP 503: PyPI treats Flask_SQLAlchemy, flask.sqlalchemy and flask-sqlalchemy as one package. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

interface RecentResponse {
  data: { last_day?: number | null; last_week?: number | null; last_month?: number | null };
  package: string;
  type: string;
}

const count = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? number(n, { unit: "count" }) : null);

const pypiConnector = defineConnector({
  id: "pypi",
  name: "PyPI",
  description: "Daily, weekly and monthly downloads of a public PyPI package.",
  homepage: "https://pypistats.org",
  tier: "free",
  verified: false,
  // pypistats updates once a day and asks for results to be cached.
  ttl: 12 * 3600,
  metrics: [
    { id: "last-day-downloads", name: "Downloads, last day", type: "number", unit: "count", params: [packageName], defaults: { label: "downloads in the last day" } },
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
  ],

  // One request answers every metric, and spellings of the same name share it.
  cacheKey: ({ params }) => `package:${normalizeName(String(params.package))}`,

  async fetch({ params }, ctx) {
    const typed = String(params.package).trim();
    if (!new RegExp(PACKAGE_NAME).test(typed)) throw new ConnectorError(`${typed} isn't a PyPI package name.`);
    const name = normalizeName(typed);

    let body: RecentResponse;
    try {
      body = await ctx.fetch.json<RecentResponse>(`https://pypistats.org/api/packages/${name}/recent`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`PyPI has no package called ${typed}.`);
      throw error;
    }

    const data = body?.data ?? {};
    return {
      "last-day-downloads": count(data.last_day),
      "weekly-downloads": count(data.last_week),
      "monthly-downloads": count(data.last_month),
    };
  },

  sample: {
    "last-day-downloads": number(3120, { unit: "count" }),
    "weekly-downloads": number(21480, { unit: "count" }),
    "monthly-downloads": number(92350, { unit: "count" }),
  },
});

export default definePlugin({
  id: "pypi",
  name: "PyPI",
  description: "Download counts of public PyPI packages.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [pypiConnector],
});

export { pypiConnector };
