# npm

Download counts of public npm packages, from npm's downloads API.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `npm` | Downloads of one package, by name (scoped names like `@types/node` work) |

| Metric | Type | What |
|---|---|---|
| `weekly-downloads` | number, count | Downloads over the last 7 days. Competes on the audience leaderboard. |
| `monthly-downloads` | number, count | Downloads over the last 30 days. |
| `daily-downloads` | series, count | One point per day for the last 30 days, oldest first. |

All three come from a single request,
`https://api.npmjs.org/downloads/range/last-month/<package>`, shared by every
tile showing the same package. The last 7 days add up to npm's own weekly
figure and all 30 to its monthly one. Names are case-sensitive on npm
(`JSONStream` and `jsonstream` are two packages), so the connector keeps the case.

## Credentials and permissions

None. Download counts are public and need no npm account or token.

## Rate limits

The downloads API is public and shared by everyone, so treat it gently; its
answers are cached for 5 minutes at npm's edge. Counts only change once a
day, so values stay fresh for 6 hours and tiles for the same package share one
request.

An unknown package shows "npm has no package called …". A rate limit or an
outage is passed to the host, which keeps the last good value.

## Develop

```bash
bun test plugins/npm
```
