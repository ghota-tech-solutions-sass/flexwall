import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type FieldValues, type NumberValue } from "@flexwall/sdk";

/**
 * Public Lichess numbers from the user endpoint. No account needed: one
 * request answers every rating, the game count and the play time.
 */

const USER = "https://lichess.org/api/user";

const username = field.text("username", "Lichess username", {
  placeholder: "DrNykterstein",
  help: "As it appears in your profile address, lichess.org/@/<username>. Case doesn't matter.",
  maxLength: 30,
  pattern: "^[A-Za-z0-9_-]{2,30}$",
  patternMessage: "can only use letters, digits, dashes and underscores",
});

/** One rating pool in `perfs`. `prov` only appears when the rating is provisional. */
export interface Perf {
  games: number;
  rating: number;
  rd?: number;
  prog?: number;
  prov?: boolean;
}

/** The slice of `GET /api/user/{username}` this connector reads. */
export interface User {
  id: string;
  username: string;
  disabled?: boolean;
  perfs?: Record<string, Perf | undefined>;
  count?: { all?: number };
  playTime?: { total?: number; tv?: number };
}

/** Lichess ids are the lowercase username, and the API accepts any case. */
export function normalizeUsername(params: FieldValues): string {
  return String(params.username ?? "").trim().toLowerCase();
}

/**
 * A rating worth showing: the pool exists, has games, and isn't provisional.
 * Lichess marks a rating provisional (shown with a "?") until it's settled, and
 * an account that never played a pool still lists it at 1500, provisional.
 */
export function establishedRating(perf: Perf | undefined): NumberValue | null {
  if (!perf || typeof perf.rating !== "number" || !(perf.games > 0) || perf.prov === true) return null;
  return number(perf.rating, { unit: "count" });
}

/**
 * Seconds as hours, one decimal. The SDK declares a "duration" unit but no
 * widget formats it yet, so time is shown as a count of hours.
 */
export function hours(seconds: number): NumberValue {
  return number(Math.round(seconds / 360) / 10, { unit: "count" });
}

const lichessConnector = defineConnector({
  id: "lichess",
  name: "Lichess",
  description: "Ratings, games and play time from public Lichess profiles.",
  homepage: "https://lichess.org",
  tier: "free",
  verified: false,
  ttl: 3600,
  metrics: [
    { id: "rating-bullet", name: "Bullet rating", description: "Empty while the rating is provisional.", type: "number", unit: "count", params: [username], defaults: { label: "Lichess bullet" } },
    { id: "rating-blitz", name: "Blitz rating", description: "Empty while the rating is provisional.", type: "number", unit: "count", params: [username], defaults: { label: "Lichess blitz" } },
    { id: "rating-rapid", name: "Rapid rating", description: "Empty while the rating is provisional.", type: "number", unit: "count", params: [username], defaults: { label: "Lichess rapid" } },
    { id: "rating-classical", name: "Classical rating", description: "Empty while the rating is provisional.", type: "number", unit: "count", params: [username], defaults: { label: "Lichess classical" } },
    { id: "games", name: "Games played", description: "Every game Lichess counts on the profile, rated or not.", type: "number", unit: "count", params: [username], defaults: { label: "games on Lichess" } },
    { id: "play-time", name: "Time played", description: "Total time spent playing, in hours.", type: "number", unit: "count", params: [username], defaults: { label: "hours played on Lichess" } },
  ],

  // One user request answers every metric.
  cacheKey: ({ params }) => `user:${normalizeUsername(params)}`,

  async fetch({ params }, ctx) {
    const id = normalizeUsername(params);
    let user: User;
    try {
      user = await ctx.fetch.json<User>(`${USER}/${encodeURIComponent(id)}`);
    } catch (error) {
      // 429 means "wait a minute": let it through so the host keeps the last value.
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`Lichess has no user called ${id}.`);
      throw error;
    }
    // A closed account answers 200 with only its id, username and disabled: true.
    if (user.disabled) throw new ConnectorError(`The Lichess account ${user.username || id} is closed.`);
    const perfs = user.perfs ?? {};
    return {
      "rating-bullet": establishedRating(perfs.bullet),
      "rating-blitz": establishedRating(perfs.blitz),
      "rating-rapid": establishedRating(perfs.rapid),
      "rating-classical": establishedRating(perfs.classical),
      games: typeof user.count?.all === "number" ? number(user.count.all, { unit: "count" }) : null,
      "play-time": typeof user.playTime?.total === "number" ? hours(user.playTime.total) : null,
    };
  },

  sample: {
    "rating-bullet": number(2104, { unit: "count" }),
    "rating-blitz": number(1987, { unit: "count" }),
    "rating-rapid": number(1912, { unit: "count" }),
    "rating-classical": number(1850, { unit: "count" }),
    games: number(8421, { unit: "count" }),
    "play-time": number(1240.5, { unit: "count" }),
  },
});

export default definePlugin({
  id: "lichess",
  name: "Lichess",
  description: "Ratings, games and play time from public Lichess profiles.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [lichessConnector],
});

export { lichessConnector };
