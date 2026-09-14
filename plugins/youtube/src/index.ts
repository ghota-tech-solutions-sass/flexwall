import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type ConnectorContext } from "@flexwall/sdk";

/**
 * Public YouTube channel statistics from the YouTube Data API v3
 * (channels.list, part=statistics). No owner account: the host provides one
 * server-side API key through YOUTUBE_API_KEY. It's sent in the
 * x-goog-api-key header rather than the query string, so request URLs never
 * carry it.
 *
 * One call costs one unit of the key's daily quota (10,000 by default) and
 * answers subscribers, views and videos for a channel.
 */

export const API = "https://www.googleapis.com/youtube/v3/channels";

/** The slice of a channels.list response this connector reads. Counts are unsigned longs, which Google's JSON sends as strings. */
export interface ChannelList {
  items?: { id: string; statistics?: { viewCount?: string | number; subscriberCount?: string | number; hiddenSubscriberCount?: boolean; videoCount?: string | number } }[];
}

const channel = field.text("channel", "Channel", {
  placeholder: "@mkbhd",
  help: "The channel's handle, like @veritasium, or its id starting with UC.",
  maxLength: 31,
  pattern: "^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$",
  patternMessage: "must be a handle starting with @ or a channel id starting with UC",
});

/** The request URL for a handle (forHandle) or a channel id (id). The key is not part of it. */
export function channelUrl(value: string): string {
  const v = value.trim();
  const filter = v.startsWith("@") ? `forHandle=${encodeURIComponent(v)}` : `id=${encodeURIComponent(v)}`;
  return `${API}?part=statistics&${filter}`;
}

function count(raw: string | number | undefined): number | null {
  const n = typeof raw === "number" ? raw : raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Google's error reasons, e.g. "quotaExceeded" or "API_KEY_INVALID", read from both places the error body lists them. */
function reasonsOf(error: HttpError): string {
  try {
    const body = JSON.parse(error.body) as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    return [...(body.error?.errors ?? []), ...(body.error?.details ?? [])].map((e) => e.reason ?? "").join(" ");
  } catch {
    return "";
  }
}

async function readChannel(ctx: ConnectorContext, value: string, key: string): Promise<ChannelList> {
  try {
    return await ctx.fetch.json<ChannelList>(channelUrl(value), { headers: { "x-goog-api-key": key, Accept: "application/json" } });
  } catch (error) {
    // Never echo error.url or error.body: keep upstream details out of what owners see.
    if (!(error instanceof HttpError)) throw error;
    const reason = reasonsOf(error);
    // Running out of quota is temporary: let the host keep the last good value.
    if (/quota|rateLimit|dailyLimit/i.test(reason)) throw error;
    if (error.status === 401 || error.status === 403 || /key/i.test(reason)) {
      throw new ConnectorError("YouTube refused this Flexwall server's API key.");
    }
    if (error.status === 404) throw new ConnectorError(`YouTube has no channel called ${value}.`);
    throw error;
  }
}

const youtubeConnector = defineConnector({
  id: "youtube",
  name: "YouTube",
  description: "Subscribers, views and videos of any public YouTube channel.",
  homepage: "https://www.youtube.com",
  tier: "free",
  verified: false,
  // Quota is per server key and per day; these numbers move slowly and subscribers are rounded anyway.
  ttl: 6 * 3600,
  metrics: [
    { id: "subscribers", name: "Subscribers", type: "number", unit: "count", params: [channel], defaults: { label: "subscribers" }, leaderboard: "audience" },
    { id: "views", name: "Total views", type: "number", unit: "count", params: [channel], defaults: { label: "views" } },
    { id: "videos", name: "Public videos", type: "number", unit: "count", params: [channel], defaults: { label: "videos" } },
  ],

  // One call answers every metric of a channel. Handles are case-insensitive, channel ids are not.
  cacheKey: ({ params }) => {
    const v = String(params.channel).trim();
    return `channel:${v.startsWith("@") ? v.toLowerCase() : v}`;
  },

  async fetch({ params }, ctx) {
    const key = ctx.env("YOUTUBE_API_KEY");
    if (!key) throw new ConnectorError("This Flexwall server has no YouTube API key.");
    const value = String(params.channel).trim();
    const body = await readChannel(ctx, value, key);
    const stats = body.items?.[0]?.statistics;
    if (!stats) throw new ConnectorError(`YouTube has no channel called ${value}.`);
    const views = count(stats.viewCount);
    const videos = count(stats.videoCount);
    const subscribers = stats.hiddenSubscriberCount ? null : count(stats.subscriberCount);
    return {
      subscribers: subscribers === null ? null : number(subscribers, { unit: "count" }),
      views: views === null ? null : number(views, { unit: "count" }),
      videos: videos === null ? null : number(videos, { unit: "count" }),
    };
  },

  sample: {
    subscribers: number(12400, { unit: "count" }),
    views: number(1_836_512, { unit: "count" }),
    videos: number(214, { unit: "count" }),
  },
});

export default definePlugin({
  id: "youtube",
  name: "YouTube",
  description: "Subscribers, views and videos of public YouTube channels.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [youtubeConnector],
});

export { youtubeConnector };
