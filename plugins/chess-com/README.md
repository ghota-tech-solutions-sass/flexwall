# Chess.com

A Flexwall plugin that shows public Chess.com ratings, read from the
[Published-Data API](https://www.chess.com/news/view/published-data-api).

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `chess-com` | Ratings and games played of a public player |

| Metric | Type | Exact meaning |
|---|---|---|
| `rating-rapid` | number (count) | `chess_rapid.last.rating`: the current rapid rating. `null` when the player has no rapid rating. |
| `rating-blitz` | number (count) | `chess_blitz.last.rating`, same rule. |
| `rating-bullet` | number (count) | `chess_bullet.last.rating`, same rule. |
| `best-rating` | number (count) | The highest `best.rating` among `chess_rapid`, `chess_blitz`, `chess_bullet` and `chess_daily`. Chess960, `tactics` (puzzles) and `puzzle_rush` are left out: they aren't game ratings in standard chess. `null` when none of the four has a best rating. |
| `games` | number (count) | `record.win + record.loss + record.draw` summed over **every** game type in the response that has a `record`: today that's `chess_rapid`, `chess_blitz`, `chess_bullet`, `chess_daily` and `chess960_daily`. `0` for a player with no record. |

The two sets differ on purpose: `games` counts everything Chess.com keeps a
record for, Chess960 included, while `best-rating` is standard chess only.

No metric enters a leaderboard: ratings aren't an audience, and the streak
board is for commit streaks.

All five come from one request,
`GET https://api.chess.com/pub/player/<username>/stats`, grouped with
`cacheKey`, so a wall showing every metric of one player costs one call.

## The username

Type the username as it appears in `chess.com/member/<username>`. Case doesn't
matter. The connector lowercases it before building the URL, not only for the
cache key: the API answers `/pub/player/Hikaru/stats` with a **301** to the
lowercase address, and Flexwall's fetch refuses redirects.

Chess.com doesn't document its username rules. The form accepts 2 to 50
letters, digits, dashes and underscores, which is wider than sign-up allows;
anything else is refused before a request is made.

## Credentials and permissions

None. The Published-Data API is public and keyless. Values aren't verified:
anyone can put anyone's public ratings on a wall.

## Limits

Chess.com allows unlimited serial requests and may answer 429 to parallel ones.
It asks for a recognizable `User-Agent` with contact details; Flexwall's fetch
already sends `flexwall.lol (+https://flexwall.lol)` on every request, so the
connector doesn't set its own.

Chess.com documents player stats as refreshed "at most once every 24 hours",
so values stay fresh for 6 hours (`ttl` 21600). When the fixture was captured,
`last-modified` was about 3 hours old and `cache-control` was `max-age=5`, so
the data may move faster than documented; 6 hours is a compromise between
being kind and a rating that feels current.

## Errors

- Unknown player (404, body `{"code":0,"message":"User \"x\" not found."}`):
  "Chess.com has no player called x."
- 410 (Chess.com: "no data will ever be available"): "Chess.com no longer
  publishes data for x."
- 429, outages and anything else go through to the host, which keeps the last
  good value.

## Verified, and not

- Verified live on 2026-09-15: the stats response shape (saved in
  `tests/fixtures/stats.json`), the 404 body, and the 301 on a capitalized
  username.
- Not verified: the response for a closed or fair-play-banned account (no such
  account was at hand), which may be a 404, a 410 or a normal stats body.
  Whether `record` counts only rated games isn't stated in the docs either.

## Develop

```bash
bun test plugins/chess-com
```
