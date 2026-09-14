# Plausible

A Flexwall plugin for [Plausible Analytics](https://plausible.io), on
plausible.io or a self-hosted instance.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `plausible` | Visitors and pageviews of a site, read with a Stats API key. Pro, verified. |

| Metric | Type | Query (`POST /api/v2/query`) |
|---|---|---|
| `visitors-30d` | number, count, audience leaderboard | `{ site_id, metrics: ["visitors", "pageviews"], date_range: "30d" }` |
| `pageviews-30d` | number, count | same query as above |
| `visitors-daily` | series, count, oldest first | `{ site_id, metrics: ["visitors"], date_range: "30d", dimensions: ["time:day"], include: { time_labels: true } }` |

Each tile picks a site with the `site` param, the domain as listed in Plausible
(`example.com`). All metrics of one site share a cache group: a refresh makes
at most two requests, the totals query and the daily query, and only the ones
some tile needs. Visitors are unique, so the 30-day total is its own query
rather than the sum of the daily points. Days with no traffic come back as 0.

There is no realtime metric. The Stats API v2 has no "current visitors"
metric, and the simple endpoint for it (`GET /api/v1/stats/realtime/visitors`)
belongs to the legacy v1 API. A connector also has one `ttl` for all its
metrics, so a "right now" number would be cached for 15 minutes anyway.

## Credentials and permissions

- **Stats API key** (secret). In Plausible: Settings → API keys → New API key,
  and pick the Stats API. Stats API keys are read-only, which is the least
  privilege Plausible offers, but they aren't per site: a key reads every site
  of the team it was created in. Create it in a team that holds only the sites
  you're happy to show, if that matters to you. The key is encrypted by the
  host and only a hint (`…abcd`) is shown in your connections.
- **Instance address** (optional, default `https://plausible.io`). Only for
  self-hosted Plausible; it must be an `https://` address. Requests still go
  through `ctx.fetch`, so private addresses and redirects are refused.

Connecting checks the key with one query that names no site: Plausible checks
the key before the site, so a good key answers "Missing site ID" (400) and a
bad one answers 401. This behaviour comes from Plausible's source code
(`AuthorizePublicAPI`), not from its documentation.

## Quotas

Plausible allows 600 API requests an hour per key by default. The `ttl` is 15
minutes, so one site costs at most 8 requests an hour: one key can feed about
75 sites. A 429 is passed through, so the host keeps showing the last good
value.

## Errors

- 401 or 403: "Plausible refused the key or it can't read example.com…".
  Plausible answers 401 both for a bad key and for a site outside the key's
  team, so one sentence covers both.
- 402: the plan doesn't include the Stats API, or the site is locked.
- 404: no such site.
- A self-hosted address that can't be reached, or doesn't answer like
  Plausible, is refused when connecting.

## Develop

```bash
bun test plugins/plausible
bun run dev   # register the plugin in apps/web/src/plugins/registry.ts first
```
