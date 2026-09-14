# YouTube

A Flexwall plugin for public YouTube channel statistics.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `youtube` | Subscribers, total views and public videos of any channel. Free, not verified. |

| Metric | Type | Field of `statistics` |
|---|---|---|
| `subscribers` | number, count, audience leaderboard | `subscriberCount`, or `null` when `hiddenSubscriberCount` is true |
| `views` | number, count | `viewCount` |
| `videos` | number, count | `videoCount` (public videos only) |

Each tile names a channel with the `channel` param: a handle (`@veritasium`)
or a channel id (`UC…`, 24 characters). All three metrics come from one call to
the YouTube Data API v3:

```
GET https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=%40veritasium
GET https://www.googleapis.com/youtube/v3/channels?part=statistics&id=UC…
```

YouTube rounds subscriber counts down to three significant figures, so
`subscribers` moves in steps.

## Credentials and permissions

Owners connect nothing: the numbers are public. The Flexwall server provides
one YouTube Data API key through `YOUTUBE_API_KEY`, read with
`ctx.env("YOUTUBE_API_KEY")`. Without it, tiles say "This Flexwall server has
no YouTube API key."

For whoever runs the server: create an API key in Google Cloud, enable only
the YouTube Data API v3 on the project, and restrict the key to that API. It
needs no OAuth scope and reads public data only.

The key is sent in the `x-goog-api-key` header, not in the URL, so it can't
leak through a request URL in an error or a log. Error messages never include
the URL or the upstream body.

## Quotas

`channels.list` costs 1 unit; a Google Cloud project gets 10,000 units a day by
default, shared by every wall on the server. The `ttl` is 6 hours, so one
channel costs 4 units a day and the default quota covers about 2,500 channels.
When the quota runs out, the error is passed through so the host keeps the last
good value instead of showing a message owners can't act on.

## Errors

- 401 or 403, or a key reason from Google (`API_KEY_INVALID`, `keyInvalid`):
  "YouTube refused this Flexwall server's API key."
- 404, or an answer with no channel in it: "YouTube has no channel called @name."
- Quota and rate limit errors, and everything else: passed through.

## Develop

```bash
bun test plugins/youtube
bun run dev   # register the plugin in apps/web/src/plugins/registry.ts first
```
