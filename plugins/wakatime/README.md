# WakaTime

A Flexwall plugin that shows coding time from the owner's own
[WakaTime](https://wakatime.com) account. Free, verified.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `wakatime` | Coding time, activity and streak, read with the owner's secret API key |

| Metric | Type | Exact meaning | Request |
|---|---|---|---|
| `coding-7d` | number (count of **hours**) | Sum of `grand_total.total_seconds` over the 7 days ending today (today included), in hours, one decimal. | summaries |
| `daily-average-7d` | number (count of **hours**) | That 7-day total divided by the days in it with coding time, in hours. Like WakaTime's own `daily_average`, days with no coding ("holidays") don't pull it down; `0` when nothing was coded. Computed from `grand_total`, which includes the "Other" language, where WakaTime's `daily_average.seconds` doesn't. | summaries |
| `all-time` | number (count of **hours**) | `data.total_seconds` of `all_time_since_today`: time logged since the account was created. `null` while WakaTime is still calculating it (below). | all-time |
| `activity` | calendar | One day per summary WakaTime returns (up to 30, ending today). `count` is hours, one decimal; `level` is 0 for no coding, 1 under 1 h, 2 under 2 h, 3 under 4 h, 4 for 4 h or more. | summaries |
| `streak` | number (count of days) | Consecutive days with coding time, ending today, or yesterday when nothing was coded yet today. Capped by the days WakaTime returns: at most 30. | summaries |

No metric enters a leaderboard. The "streak" board is labelled "Commit streak",
and a coding-time streak isn't one.

Dates are `ctx.today`, the owner's date. WakaTime reads `start` and `end` in
the timezone set on the WakaTime account, so the two can disagree for a few
hours around midnight when they're set differently.

### Requests

- **summaries**: `GET https://wakatime.com/api/v1/users/current/summaries?start=<today − 29 days>&end=<today>`.
  One request answers `coding-7d`, `daily-average-7d`, `activity` and `streak`
  (one cache group). Explicit `start`/`end` are used rather than `range`, whose
  documented values are Title Case strings ("Last 30 Days").
- **all-time**: `GET https://wakatime.com/api/v1/users/current/all_time_since_today`,
  its own cache group, only requested when a tile shows it.
- **connect**: `GET https://wakatime.com/api/v1/users/current`.

### Why hours are a count

The SDK declares a `"duration"` unit, but nothing formats it: `formatValue` and
the stat widget only handle currency and percent, so seconds would print as
"47,600". Time metrics are hours as a plain count, one decimal, and the default
labels say "hours".

The value keeps one decimal, but the stat widget prints whole numbers from 10
up (`formatNumber`): 13.2 hours shows as "13", 4.7 as "4.7". History keeps
the decimal.

### Still calculating

WakaTime answers `all_time_since_today` with **202** and `is_up_to_date: false`
while it computes the total. That's a 2xx, so it arrives as a normal body. The
connector returns `null` when `is_up_to_date` is false **and**
`percent_calculated` is under 100 (a partial total would be wrong), and returns
the total when it's 100% calculated but merely refreshing.

## Free plan history

WakaTime's pricing page gives the free plan "1 week of dashboard history"
(Basic: 2 weeks, Premium: everything). The API docs don't say how the
summaries endpoint enforces it. The connector asks for 30 days; if WakaTime
answers **402**, it asks again for the last 7 days. On a free account the
activity graph may therefore show a week, and the streak can't exceed the
history returned. When a streak reaches the oldest day returned, the connector
logs that the number is a floor.

**Unverified:** whether a free account gets a 402, days of zeros, or the full
30 days. All three are handled; the README should be updated once seen with a
real free account.

## Credentials and permissions

- **Secret API key** (Settings → Account → API Key, `wakatime.com/api-key`),
  sent as `Authorization: Basic base64(key)`: the key alone, no colon, as the
  docs' example shows (`12345` → `Basic MTIzNDU=`). `btoa` builds it, no Node
  API.
- **WakaTime has no read-only API keys.** The key gives full access to the
  account, including writing and deleting heartbeats. WakaTime's OAuth scopes
  (`read_summaries`, `read_stats`) can restrict access, but they need an OAuth
  app flow that a pasted key can't use. `help` says so. To cut Flexwall off,
  regenerate the key in WakaTime; editor plugins then need the new key too.
- The form only checks the key has no spaces. Newer keys start with `waka_`,
  older ones are bare UUIDs and the docs' own example is `12345`, so a stricter
  pattern would refuse real keys.

`connect` calls `/users/current`: a good key answers the user, a bad one 401
(checked live with a made-up key: `{"errors": ["Unauthorized."]}`). The label
is `WakaTime (@username)`, or the display name when the account has no
username; `accountId` is the user's `id`; `public` holds a hint (`…abcd`) and
that name. The key is encrypted by the host and never appears in `public`,
the label or error messages (tested).

## Limits

WakaTime asks for fewer than 10 requests a second on average over any 5 minutes,
and warns it sometimes answers **302 instead of 429**. Values stay fresh for 15
minutes (`ttl` 900): at most two requests per refresh, eight an hour. A 429, and
the 302 (which Flexwall's fetch refuses as a redirect), go through to the host,
which keeps the last good value.

## Errors

- 401/403 when connecting: "WakaTime refused this API key."
- 401/403 later (key regenerated): a sentence telling the owner to connect again.
- 402 even for 7 days: "WakaTime says this account's plan doesn't include its
  recent coding history."
- 429, the 302, outages: passed through.

## Verified, and not

- Verified: auth header format, endpoints, parameters and response fields from
  the official API docs (wakatime.com/developers, read 2026-09-15); the 401
  answer to a bad key, live.
- Not verified (no WakaTime account at hand): real response bodies (the test
  fixture `tests/fixtures/summaries.json` is built from the documented shape),
  free-plan behaviour on 30-day summaries, and whether `username` can be null.

## Develop

```bash
bun test plugins/wakatime
```
