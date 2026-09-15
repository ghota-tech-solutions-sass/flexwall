# Steam

A Flexwall plugin for public Steam profile stats, from the Steam Web API.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `steam` | Games owned, hours played and Steam level of any public profile. Free, not verified. |

| Metric | Type | Where it comes from |
|---|---|---|
| `games` | number, count | `response.game_count` of `IPlayerService/GetOwnedGames/v1`, with `include_played_free_games=1` |
| `hours-played` | number, count (hours, one decimal) | Sum of `playtime_forever` (minutes) over those games, divided by 60 |
| `hours-2weeks` | number, count (hours, one decimal) | Sum of `playtime_2weeks` (minutes) over the same games, divided by 60 |
| `level` | number, count | `response.player_level` of `IPlayerService/GetSteamLevel/v1` |

Each tile names a profile with the `profile` param, in any of these forms:

- a SteamID64: 17 digits starting with `7656119`;
- a custom URL name (`gabelogannewell`), resolved with
  `ISteamUser/ResolveVanityURL/v1`;
- a profile address: `steamcommunity.com/id/<name>` or
  `steamcommunity.com/profiles/<id>`, with or without `https://`.

Custom URL names are lowercased: Steam answers `/id/GabeLoganNewell` and
`/id/gabelogannewell` with the same profile, so both spellings share one cache
entry.

Hours are a count, not a duration: the SDK has a `duration` unit but no widget
formats it yet (same choice as the Lichess plugin).

### What the numbers mean

- `games` counts paid games in the library plus free games the player has
  launched. Free games never played aren't counted. Family-shared games aren't
  part of the library.
- `hours-played` is the library's total. Steam reports `0` minutes for every
  game when the player turned on "Always keep my total playtime private" while
  leaving game details public: the tile then shows 0 and nothing can tell it
  apart from a real 0.
- `hours-2weeks` comes from the owned-games answer, so games played in the last
  two weeks that aren't in the library (a free weekend) aren't counted.
  `GetRecentlyPlayedGames` would include them, at the cost of one more request.

### Requests

Only the requests the asked metrics need are made, in parallel after the name
is resolved:

```
GET https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=…&vanityurl=<name>   (custom names only)
GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=…&steamid=<id>&include_played_free_games=1
GET https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=…&steamid=<id>
```

## Operator setup

Owners connect nothing: the numbers are public. The Flexwall server provides
one key:

1. Sign in on Steam with the account that will own the key and open
   <https://steamcommunity.com/dev/apikey>. Enter a domain name
   (`flexwall.lol`), accept the Steam Web API Terms of Use and register.
   Steam doesn't give keys to limited accounts (accounts that haven't spent
   money on Steam).
2. Set `STEAM_API_KEY` on the server.
   It's in the variables plugins may read (`CONNECTOR_ENV` in
   `apps/web/src/composition.ts`), in `connector_secrets` in Terraform, and in
   `docs/self-hosting.md`. Without it, tiles say "This Flexwall server has no
   Steam API key."

The terms ask to keep the key confidential. Steam only accepts it as a `key`
query parameter, so it's in every request URL. This connector never logs a URL,
never puts one in a message, and rethrows HTTP errors with `key=redacted` in
their `url`, so the key can't reach an owner or a log through an error.

## Limits

The Steam Web API Terms allow 100,000 calls a day per key, for the whole server.
`ttl` is one hour: a profile showing every metric costs at most 3 calls an
hour (72 a day), so a key covers about 1,400 such profiles. 429s and outages
pass through, so tiles keep their last value.

## Errors

- No `STEAM_API_KEY`: "This Flexwall server has no Steam API key.", before any request.
- 401 or 403 (Steam's answer to a bad or revoked key): "Steam refused this Flexwall server's API key."
- `ResolveVanityURL` answers `success: 42`: "Steam has no profile at steamcommunity.com/id/<name>."
- `GetOwnedGames` answers `{"response":{}}` (private profile or private game
  details): "This Steam profile hides its games: set Game details to Public in
  Steam's privacy settings." A public library with no games answers
  `game_count: 0` and shows 0.
- `GetSteamLevel` without `player_level`: "This Steam profile is private: set My
  profile to Public in Steam's privacy settings."
- Everything else passes through.

## Not verified against a real key

- Steam publishes parameters but no example responses. The owned-games fixture
  follows the shape community answers and the TF2 wiki describe; response
  shapes weren't recorded from a real call.
- That `GetSteamLevel` answers `{"response":{}}` for a private profile.
- That `include_played_free_games=1` is accepted as `true` (it's the common
  usage, not documented).
- Case-insensitive custom URLs were checked on `steamcommunity.com/id/<name>`,
  not on `ResolveVanityURL` itself.
- The 401 and 403 bodies were seen without a valid key (`key=` missing or
  wrong); the status for a revoked key wasn't observed.
- That limited Steam accounts can't register a key (widely reported, not
  checked here).
- The custom URL pattern (2 to 32 letters, digits, `_`, `-`) is from observed
  names, not from a published rule.

## Develop

```bash
bun test plugins/steam
bunx tsc --noEmit -p plugins/steam/tsconfig.json
```
