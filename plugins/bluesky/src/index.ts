import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type FieldValues } from "@flexwall/sdk";

/**
 * Public Bluesky profile numbers. No account needed: getProfile on the public
 * AppView answers followers, following and posts in one request.
 */

const PROFILE = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile";

// A full handle (domain name), with an optional leading @ because that's how people copy it.
const handle = field.text("handle", "Bluesky handle", {
  placeholder: "jay.bsky.team",
  help: "The full handle, like jay.bsky.team. A leading @ is fine.",
  maxLength: 254,
  pattern: "^@?(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$",
  patternMessage: "must be a full handle, like jay.bsky.team",
});

/** The handle as the AppView wants it: no @, lowercase (handles are case-insensitive). */
export function normalizeHandle(params: FieldValues): string {
  return String(params.handle ?? "").trim().replace(/^@/, "").toLowerCase();
}

interface Profile {
  handle: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

const count = (n: number | undefined) => (typeof n === "number" ? number(n, { unit: "count" }) : null);

const blueskyConnector = defineConnector({
  id: "bluesky",
  name: "Bluesky",
  description: "Followers, following and posts from public Bluesky profiles.",
  homepage: "https://bsky.app",
  tier: "free",
  verified: false,
  ttl: 3600,
  metrics: [
    { id: "followers", name: "Followers", type: "number", unit: "count", params: [handle], defaults: { label: "Bluesky followers" }, leaderboard: "audience" },
    { id: "following", name: "Following", type: "number", unit: "count", params: [handle], defaults: { label: "following on Bluesky" } },
    { id: "posts", name: "Posts", type: "number", unit: "count", params: [handle], defaults: { label: "Bluesky posts" } },
  ],

  // One profile answers every metric for a handle.
  cacheKey: ({ params }) => `profile:${normalizeHandle(params)}`,

  async fetch({ params }, ctx) {
    const actor = normalizeHandle(params);
    let profile: Profile;
    try {
      profile = await ctx.fetch.json<Profile>(`${PROFILE}?actor=${encodeURIComponent(actor)}`);
    } catch (error) {
      // The AppView answers 400 (not 404) for a handle it can't resolve or an account it won't show.
      if (error instanceof HttpError && error.status === 400) throw new ConnectorError(profileProblem(actor, error.body));
      throw error;
    }
    return { followers: count(profile.followersCount), following: count(profile.followsCount), posts: count(profile.postsCount) };
  },

  sample: {
    followers: number(12840, { unit: "count" }),
    following: number(412, { unit: "count" }),
    posts: number(2317, { unit: "count" }),
  },
});

function profileProblem(actor: string, body: string): string {
  let code = "";
  try {
    code = String((JSON.parse(body) as { error?: unknown }).error ?? "");
  } catch {
    // Not JSON: fall through to the generic sentence.
  }
  if (code === "AccountDeactivated") return `The Bluesky account @${actor} is deactivated.`;
  if (code === "AccountTakedown") return `The Bluesky account @${actor} has been suspended.`;
  return `Bluesky has no profile called @${actor}.`;
}

export default definePlugin({
  id: "bluesky",
  name: "Bluesky",
  description: "Followers, following and posts from public Bluesky profiles.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [blueskyConnector],
});

export { blueskyConnector };
