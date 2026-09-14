import { ConnectorError, defineConnector, definePlugin, field, number } from "@flexwall/sdk";

/**
 * Public Hacker News numbers from the official Firebase API. No account
 * needed; one user record answers karma and submissions.
 */

const USERS = "https://hacker-news.firebaseio.com/v0/user";

/**
 * The record lists every story, comment and poll the user ever submitted, so
 * prolific users weigh hundreds of kilobytes (dang is about 750 KB). Ask for
 * the host maximum rather than failing on the people most worth showing.
 */
export const MAX_BYTES = 4_000_000;

// Hacker News ids are case-sensitive: "PG" isn't "pg".
const user = field.text("user", "Hacker News username", {
  placeholder: "pg",
  help: "Exactly as it appears on your profile: usernames are case-sensitive.",
  maxLength: 15,
  pattern: "^[A-Za-z0-9_-]{2,15}$",
  patternMessage: "isn't a valid Hacker News username",
});

interface User {
  id: string;
  karma?: number;
  submitted?: number[];
}

const hackernewsConnector = defineConnector({
  id: "hackernews",
  name: "Hacker News",
  description: "Karma and submissions from public Hacker News profiles.",
  homepage: "https://news.ycombinator.com",
  tier: "free",
  verified: false,
  ttl: 3600,
  metrics: [
    { id: "karma", name: "Karma", type: "number", unit: "count", params: [user], defaults: { label: "HN karma" }, leaderboard: "audience" },
    { id: "submissions", name: "Submissions", description: "Stories, comments and polls, deleted ones included.", type: "number", unit: "count", params: [user], defaults: { label: "HN submissions" } },
  ],

  // One user record answers both metrics. No lowercasing: ids are case-sensitive.
  cacheKey: ({ params }) => `user:${String(params.user)}`,

  async fetch({ params }, ctx) {
    const id = String(params.user);
    // Other failures (outage, timeout) aren't the owner's to fix: let them through.
    const record = await ctx.fetch.json<User | null>(`${USERS}/${encodeURIComponent(id)}.json`, { maxBytes: MAX_BYTES, timeoutMs: 10_000 });
    // Firebase answers 200 with null for a user that doesn't exist.
    if (record === null) throw new ConnectorError(`Hacker News has no user called ${id} (usernames are case-sensitive).`);
    return {
      karma: typeof record.karma === "number" ? number(record.karma, { unit: "count" }) : null,
      submissions: number(Array.isArray(record.submitted) ? record.submitted.length : 0, { unit: "count" }),
    };
  },

  sample: {
    karma: number(8421, { unit: "count" }),
    submissions: number(1937, { unit: "count" }),
  },
});

export default definePlugin({
  id: "hackernews",
  name: "Hacker News",
  description: "Karma and submissions from public Hacker News profiles.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [hackernewsConnector],
});

export { hackernewsConnector };
