import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type FieldValues, type NumberValue } from "@flexwall/sdk";

/**
 * Public Chess.com ratings through the Published-Data API. No account needed:
 * one stats request per player answers every metric.
 */

const STATS = "https://api.chess.com/pub/player";

/** The time controls a player's current and best rating are read from. Chess960, tactics and Puzzle Rush aren't. */
const RATED = { "rating-rapid": "chess_rapid", "rating-blitz": "chess_blitz", "rating-bullet": "chess_bullet" } as const;
const STANDARD = ["chess_rapid", "chess_blitz", "chess_bullet", "chess_daily"] as const;

const username = field.text("username", "Chess.com username", {
  placeholder: "hikaru",
  help: "As it appears in your profile address, chess.com/member/<username>. Case doesn't matter.",
  maxLength: 50,
  // Chess.com doesn't document its username rules; stay wider than what sign-up allows today.
  pattern: "^[A-Za-z0-9_-]{2,50}$",
  patternMessage: "can only use letters, digits, dashes and underscores",
});

/** The shape of one game type in the stats response. Keys the connector doesn't read are left out. */
interface GameStats {
  last?: { rating?: number };
  best?: { rating?: number };
  record?: { win?: number; loss?: number; draw?: number };
}

export type Stats = Record<string, unknown>;

/**
 * Chess.com usernames are case-insensitive, and the API answers a capitalized
 * one with a 301 to the lowercase address, which ctx.fetch refuses. Lowercase
 * before building the URL, not only for the cache key.
 */
export function normalizeUsername(params: FieldValues): string {
  return String(params.username ?? "").trim().toLowerCase();
}

const rating = (n: number) => number(n, { unit: "count" });

function gameStats(stats: Stats, key: string): GameStats | null {
  const value = stats[key];
  return value && typeof value === "object" ? (value as GameStats) : null;
}

/** Current rating in a time control, or null when the player has never played it. */
export function currentRating(stats: Stats, key: string): NumberValue | null {
  const r = gameStats(stats, key)?.last?.rating;
  return typeof r === "number" ? rating(r) : null;
}

/** Highest `best.rating` across rapid, blitz, bullet and daily. Null when none has one. */
export function bestRating(stats: Stats): NumberValue | null {
  const bests = STANDARD.map((key) => gameStats(stats, key)?.best?.rating).filter((r): r is number => typeof r === "number");
  return bests.length ? rating(Math.max(...bests)) : null;
}

/** Wins, losses and draws summed over every game type that has a record (daily and Chess960 daily included). */
export function gamesPlayed(stats: Stats): number {
  let total = 0;
  for (const key of Object.keys(stats)) {
    const record = gameStats(stats, key)?.record;
    if (!record) continue;
    total += (record.win ?? 0) + (record.loss ?? 0) + (record.draw ?? 0);
  }
  return total;
}

const chessComConnector = defineConnector({
  id: "chess-com",
  name: "Chess.com",
  description: "Ratings and games played from public Chess.com profiles.",
  homepage: "https://www.chess.com",
  tier: "free",
  verified: false,
  // Chess.com documents player stats as refreshed at most once every 24 hours.
  ttl: 6 * 3600,
  metrics: [
    { id: "rating-rapid", name: "Rapid rating", type: "number", unit: "count", params: [username], defaults: { label: "Chess.com rapid" } },
    { id: "rating-blitz", name: "Blitz rating", type: "number", unit: "count", params: [username], defaults: { label: "Chess.com blitz" } },
    { id: "rating-bullet", name: "Bullet rating", type: "number", unit: "count", params: [username], defaults: { label: "Chess.com bullet" } },
    {
      id: "best-rating",
      name: "Best rating",
      description: "The highest rating ever reached in rapid, blitz, bullet or daily.",
      type: "number",
      unit: "count",
      params: [username],
      defaults: { label: "best Chess.com rating" },
    },
    {
      id: "games",
      name: "Games played",
      description: "Wins, losses and draws across every game type Chess.com lists in the player's stats.",
      type: "number",
      unit: "count",
      params: [username],
      defaults: { label: "games on Chess.com" },
    },
  ],

  // One stats request answers every metric of a player.
  cacheKey: ({ params }) => `player:${normalizeUsername(params)}`,

  async fetch({ params }, ctx) {
    const player = normalizeUsername(params);
    let stats: Stats;
    try {
      stats = await ctx.fetch.json<Stats>(`${STATS}/${encodeURIComponent(player)}/stats`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`Chess.com has no player called ${player}.`);
      if (error instanceof HttpError && error.status === 410) throw new ConnectorError(`Chess.com no longer publishes data for ${player}.`);
      throw error;
    }
    if (!stats || typeof stats !== "object") throw new Error("Chess.com answered stats that aren't an object");
    return {
      "rating-rapid": currentRating(stats, RATED["rating-rapid"]),
      "rating-blitz": currentRating(stats, RATED["rating-blitz"]),
      "rating-bullet": currentRating(stats, RATED["rating-bullet"]),
      "best-rating": bestRating(stats),
      games: number(gamesPlayed(stats), { unit: "count" }),
    };
  },

  sample: {
    "rating-rapid": number(1842, { unit: "count" }),
    "rating-blitz": number(1765, { unit: "count" }),
    "rating-bullet": number(1690, { unit: "count" }),
    "best-rating": number(1911, { unit: "count" }),
    games: number(4218, { unit: "count" }),
  },
});

export default definePlugin({
  id: "chess-com",
  name: "Chess.com",
  description: "Ratings and games played from public Chess.com profiles.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [chessComConnector],
});

export { chessComConnector };
