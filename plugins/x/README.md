# X

A Flexwall plugin that reads the public numbers of one X account through the
X API v2, with **the owner's own X developer app**. X bills every read to the
owner's developer account; Flexwall pays nothing and holds no X key.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `x` | Free tier, unverified. Bring your own Bearer Token. |

| Metric | Type | Where it comes from |
|---|---|---|
| `followers` | Count | `public_metrics.followers_count`. Competes on the audience leaderboard. |
| `following` | Count | `public_metrics.following_count`. |
| `posts` | Count | `public_metrics.post_count` (posts including reposts), or `tweet_count` when X sends the older name. |
| `listed` | Count | `public_metrics.listed_count`: lists that include the account. |
| `likes` | Count | `public_metrics.like_count`: posts the account liked. Optional in X's schema; no value when X leaves it out. |

All five come from one request:

```
GET https://api.x.com/2/users/by/username/:username?user.fields=public_metrics
Authorization: Bearer <token>
```

The handle lives on the connection, not on tiles, so every tile of a
connection shares one cache group and one read.

## Operator note

Nothing to configure on the server: no environment variable, no Flexwall X
app. Each owner brings their own.

## Owner setup

1. Open the X developer console (<https://console.x.com>, reached from
   developer.x.com) and create a project with an app in it. An app outside a
   project gets `403 client-not-enrolled`.
2. Buy credits for the developer account (pay-per-use; no subscription).
   Without credits X answers `402 CreditsDepleted`.
3. In the app, open **Keys and tokens** and copy the **Bearer Token**
   (app-only). Paste it without the word `Bearer`.
4. In Flexwall, type the handle (`@` optional) and pick how often to refresh.

The token is stored encrypted and only sent to `api.x.com` in the
`Authorization` header. The connection list shows its last four characters.
Regenerating the token in the console revokes Flexwall's copy.

### Why an app-only Bearer Token

The lookup is billed as **User: Read, $0.010 per resource** whichever
credential makes it. X's cheaper "Owned Reads" ($0.001) only apply to twelve
collection endpoints (`/2/users/{id}/tweets`, `/followers`, `/following`,
`/liked_tweets`, …) when `{id}` is the authenticated user who owns the app.
`/2/users/by/username/:username` isn't one of them, so an OAuth 2.0 user token
would add a sign-in flow and token refreshes without lowering the price. The
Bearer Token is the simplest credential that reads a public profile.

## Cost

Prices from <https://docs.x.com/x-api/getting-started/pricing> (checked
September 2026): **User: Read $0.010 per resource**, deducted from prepaid
credits. One refresh is one user read, whatever the number of tiles.

| Refresh | Reads a month | Upper bound a month |
|---|---|---|
| Every hour | ~720 | $7.20 |
| Every 6 hours (default) | ~120 | $1.20 |
| Every 24 hours | ~30 | $0.30 |

- The table is **per connected account**, not per tile: tiles of the same
  connection share one cached read, and renders never read X more often than
  the chosen refresh.
- These are upper bounds. X deduplicates resources within a 24-hour UTC day:
  reading the same user again before midnight UTC isn't charged again. In
  practice any refresh costs about one read a day, ~$0.30 a month. X calls
  deduplication a soft guarantee (outages can break it), so the labels show
  the undeduplicated figure.
- Connecting makes one read too.
- Prices change; the console shows current rates. The constants live at the
  top of `src/index.ts` (`PRICE_PER_USER_READ_USD`) and the labels derive from them.

## Freshness and limits

`ttl` is 3600 s, the floor. `ttlFor` returns the connection's own refresh
(`public.refresh` hours × 3600), clamped to one hour to one day, and 6 hours
when the value is missing or unreadable.

X allows 300 requests per 15 minutes per app on this endpoint. One read an
hour per handle is far below it. A 429 (rate limit or usage cap) is passed
through and the tile keeps its last value.

## Errors

| X answers | Owner sees |
|---|---|
| 401 | "X refused this Bearer Token: copy it again…" |
| 402 `CreditsDepleted` | "Your X developer account has no credits left: add credits in the X developer console…" |
| 403 `client-not-enrolled` / `client-forbidden` | "This X app can't use the API yet: … belongs to a project and your account has credits." |
| other 403 | "X refused this Bearer Token access to user lookups…" |
| 200 with `errors`, "User has been suspended" | "The X account @handle is suspended." |
| 200 with `errors`, `resource-not-found` | "X has no account called @handle." |
| 429, 403 `usage-capped`, 5xx, a 200 with any other error | Passed through; tiles stay on their last value, marked stale. |

Handles are matched by X's own rule, `^[A-Za-z0-9_]{1,15}$`, with an optional
leading `@`. They're stored and requested lowercase: X handles are
case-insensitive.

## Why it's unverified

`verified` means the numbers come from the owner's own authenticated account.
An app-only Bearer Token proves the owner has an X developer app, not that the
handle is theirs: anyone can type any handle. So the connector is unverified.
Followers still compete on the audience leaderboard, like other unverified
audience connectors (YouTube, Bluesky); audience isn't one of the
verified-only boards.

Tier is free: the owner pays X for every read, so running the connector costs
Flexwall nothing.

## Not verified against the live API

Built from docs.x.com (OpenAPI spec, User lookup, Rate limits, Response codes,
Pricing) and error bodies developers report, without a funded X app:

- `post_count` vs `tweet_count`: the spec names `post_count`, the documented
  example still shows `tweet_count`. Both are read.
- whether `like_count` is filled for an app-only read of another account (it's
  optional and nullable in the spec).
- the exact 402 `CreditsDepleted` and 403 `client-not-enrolled` bodies (from
  developer reports, with `api.twitter.com` problem URLs); matching is loose.
- the exact 200-with-errors bodies for unknown and suspended handles (from
  developer reports); a suspended account is recognised by "suspended" in
  `detail`.
- whether a protected account comes back with `public_metrics` on an app-only
  read. If X sends the user without them (or with a field-level partial
  error), every metric has no value rather than an error.
- that a renamed account's old handle gives `resource-not-found` (the owner
  reconnects with the new handle; the account id stays the same).
- that deduplication applies per user across app-only lookups exactly as the
  pricing page describes.

## Develop

```bash
bun test plugins/x
bunx tsc --noEmit -p plugins/x/tsconfig.json
```
