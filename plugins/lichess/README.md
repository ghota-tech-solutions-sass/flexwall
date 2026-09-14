# Lichess

A Flexwall plugin that shows public Lichess ratings, games and play time.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `lichess` | Public profile numbers of a Lichess user |

| Metric | Type | Exact meaning |
|---|---|---|
| `rating-bullet` | number (count) | `perfs.bullet.rating`, or `null` when the rating isn't established (below). |
| `rating-blitz` | number (count) | `perfs.blitz.rating`, same rule. |
| `rating-rapid` | number (count) | `perfs.rapid.rating`, same rule. |
| `rating-classical` | number (count) | `perfs.classical.rating`, same rule. |
| `games` | number (count) | `count.all` exactly as Lichess reports it: the profile's game count, rated and casual (`count.rated` is the rated part). Imported games appear to sit outside it in `count.import` (in the fixture, `win + loss + draw` is within 5 of `all`, far from `all - import`); Lichess doesn't document it. |
| `play-time` | number (count of **hours**) | `playTime.total` (seconds spent playing) divided by 3600, rounded to one decimal. |

No metric enters a leaderboard: ratings aren't an audience, and the streak
board is for commit streaks.

### When a rating is null

A rating is `null` when the pool is missing from `perfs`, when its `games` is
`0`, or when `prov` is `true`. Lichess marks a rating provisional (shown with a
`?` on the site) until its deviation is low enough, and an account that never
played a pool still lists it at 1500, provisional, with 0 games. A player who
stops playing a pool for months can become provisional again: the tile then
goes empty until they play.

### Why hours are a count

The SDK declares a `"duration"` unit, but nothing formats it: `formatValue` and
the stat widget only handle currency and percent, so a duration in seconds
would print as "6,602,756". `play-time` is therefore hours as a plain count,
and the default label says "hours played on Lichess".

The value keeps one decimal, but the stat widget prints whole numbers from 10
up (`formatNumber`): 13.2 hours shows as "13", 4.7 as "4.7". History keeps
the decimal.

## The username

Type the username as it appears in `lichess.org/@/<username>`. Case doesn't
matter: the API answers any case directly (no redirect), and the connector
lowercases it, which is also the user's `id`, so equivalent spellings share one
cache entry.

## Credentials and permissions

None. `GET https://lichess.org/api/user/<username>` is public. Values aren't
verified: anyone can put anyone's public numbers on a wall.

## Limits

Lichess asks clients to make one request at a time and, after a 429, to wait at
least a minute. One user costs one request, grouped with `cacheKey`, and values
stay fresh for an hour (`ttl` 3600). A 429 goes through to the host, which keeps
showing the last good value instead of retrying.

## Errors

- Unknown user (404, `{"error":"Not found"}`): "Lichess has no user called x."
- Closed account: Lichess answers **200** with only
  `{"id","username","disabled":true}`; the connector turns it into "The Lichess
  account x is closed."
- Accounts marked for a terms-of-service violation (`tosViolation: true`) still
  answer their full profile and are shown like any other.
- 429, outages and anything else go through to the host.

## Verified, and not

Verified live on 2026-09-15: the full user shape (`tests/fixtures/user.json`),
a closed account (`tests/fixtures/closed.json`), the 404 body, fresh accounts
with 0-game provisional pools, and that a capitalized username answers 200.
Nothing here depends on unverified behaviour.

## Develop

```bash
bun test plugins/lichess
```
