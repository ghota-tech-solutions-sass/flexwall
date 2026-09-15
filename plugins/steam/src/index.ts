import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type ConnectorContext, type NumberValue } from "@flexwall/sdk";

/**
 * Public Steam profile stats from the Steam Web API. No owner account: the
 * host provides one server-side key through STEAM_API_KEY.
 *
 * Steam only takes the key as a `key` query parameter, so every request URL
 * carries it. Nothing here logs a URL, and an HttpError is rethrown with the
 * key cut out of its `url` so the host can't print it either.
 *
 *  - `ISteamUser/ResolveVanityURL/v1`: a custom URL name to a SteamID64.
 *  - `IPlayerService/GetOwnedGames/v1` (with played free games): `games`,
 *    `hours-played` and `hours-2weeks`, one request for all three.
 *  - `IPlayerService/GetSteamLevel/v1`: `level`.
 */

export const API = "https://api.steampowered.com";

const STEAM_ID = "7656119\\d{10}";
const VANITY = "[A-Za-z0-9_-]{2,32}";

const profile = field.text("profile", "Steam profile", {
  placeholder: "gabelogannewell",
  help: "A SteamID64 (17 digits starting with 7656119), a custom URL name, or the profile's steamcommunity.com address.",
  maxLength: 100,
  pattern: `^(${STEAM_ID}|${VANITY}|(https?://)?(www\\.)?steamcommunity\\.com/(id/${VANITY}|profiles/${STEAM_ID})/?)$`,
  patternMessage: "must be a SteamID64, a custom URL name or a steamcommunity.com profile address",
});

export type ProfileRef = { kind: "id"; id: string } | { kind: "vanity"; name: string };

/** What the owner typed, as an id or a custom URL name. Custom URL names are case-insensitive on Steam: they're lowercased. */
export function parseProfile(value: string): ProfileRef {
  const v = value.trim().replace(/\/+$/, "");
  const url = /steamcommunity\.com\/(id|profiles)\/([^/?#]+)$/i.exec(v);
  if (url) return url[1].toLowerCase() === "profiles" ? { kind: "id", id: url[2] } : { kind: "vanity", name: url[2].toLowerCase() };
  if (new RegExp(`^${STEAM_ID}$`).test(v)) return { kind: "id", id: v };
  return { kind: "vanity", name: v.toLowerCase() };
}

/**
 * Minutes as hours, one decimal. The SDK declares a "duration" unit but no
 * widget formats it yet, so time is shown as a count of hours.
 */
export function hours(minutes: number): NumberValue {
  return number(Math.round(minutes / 6) / 10, { unit: "count" });
}

export interface OwnedGames {
  response?: { game_count?: number; games?: { appid: number; playtime_forever?: number; playtime_2weeks?: number }[] };
}
export interface SteamLevel {
  response?: { player_level?: number };
}
export interface VanityAnswer {
  response?: { success?: number; steamid?: string; message?: string };
}

const OWNED_METRICS = ["games", "hours-played", "hours-2weeks"];

/** GETs a Steam Web API method. Errors never carry the key: the URL is redacted before anything is rethrown. */
async function call<T>(ctx: ConnectorContext, key: string, path: string, query: Record<string, string>): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ key, ...query }).toString()}`;
  try {
    return await ctx.fetch.json<T>(url, { maxBytes: 4_000_000 });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    // Steam answers a bad key with 401 or 403 and an HTML page saying "verify your key= parameter".
    if (error.status === 401 || error.status === 403) throw new ConnectorError("Steam refused this Flexwall server's API key.");
    throw new HttpError(error.status, redact(error.url), error.body);
  }
}

export function redact(url: string): string {
  const u = new URL(url);
  if (u.searchParams.has("key")) u.searchParams.set("key", "redacted");
  return u.toString();
}

async function steamId(ctx: ConnectorContext, key: string, ref: ProfileRef): Promise<string> {
  if (ref.kind === "id") return ref.id;
  const body = await call<VanityAnswer>(ctx, key, "ISteamUser/ResolveVanityURL/v1/", { vanityurl: ref.name });
  const r = body.response;
  if (r?.success === 1 && r.steamid && /^\d{17}$/.test(r.steamid)) return r.steamid;
  if (r?.success === 42) throw new ConnectorError(`Steam has no profile at steamcommunity.com/id/${ref.name}.`);
  throw new Error(`Steam couldn't resolve a custom URL (success ${r?.success ?? "missing"})`);
}

const steamConnector = defineConnector({
  id: "steam",
  name: "Steam",
  description: "Games owned, hours played and level of a public Steam profile.",
  homepage: "https://store.steampowered.com",
  tier: "free",
  verified: false,
  // The key allows 100,000 calls a day for the whole server; these numbers move slowly.
  ttl: 3600,
  metrics: [
    { id: "games", name: "Games owned", description: "Games in the library, played free games included.", type: "number", unit: "count", params: [profile], defaults: { label: "games on Steam" } },
    { id: "hours-played", name: "Hours played", description: "Total time played across the library, in hours.", type: "number", unit: "count", params: [profile], defaults: { label: "hours played" } },
    { id: "hours-2weeks", name: "Hours in the last 2 weeks", description: "Time played over the last two weeks, in hours.", type: "number", unit: "count", params: [profile], defaults: { label: "hours played in 2 weeks" } },
    { id: "level", name: "Steam level", type: "number", unit: "count", params: [profile], defaults: { label: "Steam level" } },
  ],

  // One profile's requests answer every metric; custom URL names ignore case.
  cacheKey: ({ params }) => {
    const ref = parseProfile(String(params.profile));
    return ref.kind === "id" ? `profile:${ref.id}` : `vanity:${ref.name}`;
  },

  async fetch({ metrics, params }, ctx) {
    const key = ctx.env("STEAM_API_KEY");
    if (!key) throw new ConnectorError("This Flexwall server has no Steam API key.");
    const ref = parseProfile(String(params.profile));
    const id = await steamId(ctx, key, ref);
    const wantsOwned = metrics.some((m) => OWNED_METRICS.includes(m));
    const wantsLevel = metrics.includes("level");

    const [owned, level] = await Promise.all([
      wantsOwned ? call<OwnedGames>(ctx, key, "IPlayerService/GetOwnedGames/v1/", { steamid: id, include_played_free_games: "1" }) : null,
      wantsLevel ? call<SteamLevel>(ctx, key, "IPlayerService/GetSteamLevel/v1/", { steamid: id }) : null,
    ]);

    const out: Record<string, NumberValue> = {};
    if (owned) {
      const r = owned.response;
      // A private profile or private game details answer {"response":{}}; zero games is game_count 0.
      if (typeof r?.game_count !== "number") throw new ConnectorError("This Steam profile hides its games: set Game details to Public in Steam's privacy settings.");
      const games = r.games ?? [];
      out.games = number(r.game_count, { unit: "count" });
      out["hours-played"] = hours(games.reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0));
      out["hours-2weeks"] = hours(games.reduce((sum, g) => sum + (g.playtime_2weeks ?? 0), 0));
    }
    if (level) {
      if (typeof level.response?.player_level !== "number") throw new ConnectorError("This Steam profile is private: set My profile to Public in Steam's privacy settings.");
      out.level = number(level.response.player_level, { unit: "count" });
    }
    return out;
  },

  sample: {
    games: number(214, { unit: "count" }),
    "hours-played": number(3812.5, { unit: "count" }),
    "hours-2weeks": number(18.4, { unit: "count" }),
    level: number(42, { unit: "count" }),
  },
});

export default definePlugin({
  id: "steam",
  name: "Steam",
  description: "Games owned, hours played and level of public Steam profiles.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [steamConnector],
});

export { steamConnector };
