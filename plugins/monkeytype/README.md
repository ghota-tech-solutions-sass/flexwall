# Monkeytype

A Flexwall plugin that shows personal bests and typing stats from the owner's
own [Monkeytype](https://monkeytype.com) account. Free, verified.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `monkeytype` | Personal bests and typing stats, read with an ApeKey |

| Metric | Type | Exact meaning | Request |
|---|---|---|---|
| `wpm-60s` | number (count) | The highest `wpm` among the personal bests for 60-second time tests, whatever the language, difficulty, punctuation or numbers setting. `null` with no 60-second best. | bests |
| `wpm-15s` | number (count) | The same for 15-second time tests. | bests |
| `tests-completed` | number (count) | `completedTests` from the typing stats. `0` when the account has none. | stats |
| `time-typing` | number (count of **hours**) | `timeTyping` (seconds, per the API docs) divided by 3600, one decimal. | stats |

No metric enters a leaderboard.

### Requests

- **bests**: `GET https://api.monkeytype.com/users/personalBests?mode=time`
- **stats**: `GET https://api.monkeytype.com/users/stats`

Both carry `Authorization: ApeKey <key>`. All metrics share one cache group,
and a refresh only makes the requests some tile needs: two at most.

`mode2` is left out on purpose. Monkeytype's query schema makes it optional and
the server then returns every time-mode best at once, keyed by test length
(`"15"`, `"30"`, `"60"`, `"120"`), so one request answers both WPM metrics.

**The OpenAPI document and the server disagree** on this endpoint's body. The
document describes `data` as a single personal best; the server's code
(`UserDAL.getPersonalBests`) returns `personalBests[mode]` (or
`[mode][mode2]`), and the shared schema stores an **array** of bests per test
length, one per language and setting. The parser accepts an array or a single
object under each length and takes the highest `wpm`.

### Why hours are a count

The SDK declares a `"duration"` unit, but nothing formats it: `formatValue` and
the stat widget only handle currency and percent, so seconds would print as
"347,401". `time-typing` is hours as a plain count and its default label says
"hours typing".

The value keeps one decimal, but the stat widget prints whole numbers from 10
up (`formatNumber`): 13.2 hours shows as "13", 4.7 as "4.7". History keeps
the decimal.

## Credentials and permissions

- **ApeKey** (secret). In Monkeytype: Account settings → Ape keys → generate
  new key. The key is shown **once**, and new ApeKeys are **disabled** until
  the owner switches them on in the "active" column (both from Monkeytype's
  own UI code). `help` says so, and a disabled key (471) gets its own sentence.
- ApeKeys are Monkeytype's least-privilege credential: only endpoints marked
  to accept them work with one, and in the public API docs those are all `GET`
  reads (results, personal bests, stats, tags, streak, activity, leaderboard
  rank). Delete the key in Monkeytype to cut Flexwall off.
- `connect` calls `/users/stats`, the cheapest ApeKey call that tells a working
  key from a refused one. No ApeKey endpoint returns a username or user id, so
  the label is `Monkeytype (key …abcd)` (a 4-character hint), `public` holds
  only that hint, and there's no `accountId`. The key never appears in
  `public`, the label or error messages (tested).

## Limits

The API docs: "a rate limit of 30 requests per minute across all endpoints with
some endpoints being more strict. Rate limit rates are shared across all ape
keys." In Monkeytype's source, `/users/stats` and `/users/personalBests` fall
under that default ApeKey limit (30 a minute); the punishing one, 30 a day, is
on `/results`, which this connector doesn't use. Values stay fresh for an hour
(`ttl` 3600): two requests an hour per account, leaving the owner's quota for
their own tools.

## Errors

| Answer | Meaning | Handling |
|---|---|---|
| 471 | ApeKey is inactive | "This ApeKey isn't active yet…" |
| 470, 472, 401; 400 "Malformed ApeKey"; 404 "ApeKey not found" | Invalid, malformed, missing or deleted key | "Monkeytype refused this ApeKey…" |
| 479, 429 | ApeKey or general rate limit | passed through |
| 503 "ApeKeys are not being accepted at this time" | Monkeytype paused ApeKeys | passed through |

## Verified, and not

- Verified live on 2026-09-15 with made-up keys: 400 `Malformed ApeKey` for a
  non-base64 key, 472 for a badly shaped one, 404 `ApeKey not found` for a
  well-formed unknown one, 401 `Unauthorized` without a key. Verified in the
  docs and source: the header format, rate limits, status codes, `timeTyping`
  in seconds, the stored shape of personal bests, and that `mode2` is optional.
- Query encoding: the server parses query values as JSON (`jsonQuery: true`,
  which is why the OpenAPI document lists them under `application/json`), so a
  plain `?mode=time` could in theory need quoting. Checked live: the public
  `GET /leaderboards?language=english&mode=time&mode2=60&page=0` answers 200
  with plain values under the same contract setting. If `/users/personalBests`
  ever answers 422, the JSON-quoted form (`mode=%22time%22`) is the fallback.
- Not verified (no Monkeytype account at hand): a real successful body from
  either endpoint (test fixtures follow the source schemas), and in particular
  that `?mode=time` without `mode2` returns every length keyed by seconds, as
  the source code reads.

## Develop

```bash
bun test plugins/monkeytype
```
