# Bluesky

A Flexwall plugin that shows public Bluesky profile numbers.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `bluesky` | Public profile numbers for a handle |

| Metric | Type | Leaderboard |
|---|---|---|
| `followers` | number (count) | audience |
| `following` | number (count) | |
| `posts` | number (count) | |

All three come from one request to the public AppView,
`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=<handle>`,
grouped with `cacheKey`, so a wall showing all three for the same handle costs
one call an hour.

## The handle

Type the full handle, like `jay.bsky.team` or `someone.bsky.social`. A leading
`@` is accepted and case doesn't matter: `@Jay.bsky.team` is stored as typed and
read as `jay.bsky.team`. A bare name without a domain (`jay`) is refused by the
form, because Bluesky can't resolve it.

## Credentials and permissions

None. The connector reads the public AppView, which needs no account and no
key. Values aren't verified: anyone can put anyone's public numbers on a wall.

## Rate limits

The public AppView is cached by Bluesky and rate limited per IP address;
Bluesky doesn't publish exact numbers for it. Values stay fresh for an hour
(`ttl` 3600), which is well within those limits and matches how slowly
follower counts move.

## Errors

- Unknown handle: "Bluesky has no profile called @handle."
- Deactivated or suspended account: a sentence saying so.
- Outages go through to the host, which keeps the last good value.

## Develop

```bash
bun test plugins/bluesky
```
