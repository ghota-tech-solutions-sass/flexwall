# Hacker News

A Flexwall plugin that shows public Hacker News profile numbers.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `hackernews` | Public profile numbers for a username |

| Metric | Type | Leaderboard |
|---|---|---|
| `karma` | number (count) | audience |
| `submissions` | number (count) | |

Both come from one request to the official Firebase API,
`https://hacker-news.firebaseio.com/v0/user/<id>.json`, grouped with
`cacheKey`. `submissions` is the length of the user's `submitted` list: every
story, comment and poll, including deleted ones.

## The username

Usernames are case-sensitive on Hacker News: `pg` exists, `PG` doesn't. Type it
exactly as it appears on the profile page.

## Credentials and permissions

None. The Firebase API is public and needs no account and no key. Values aren't
verified: anyone can put anyone's public numbers on a wall.

## Rate limits and size

The API documents no rate limit today. Values stay fresh for an hour (`ttl`
3600): karma moves slowly and there's no reason to ask more often.

The user record carries the full `submitted` list, so prolific users are big
(`dang` is about 750 KB). The connector asks for the host's maximum response
size (4 MB) and a 10 second timeout instead of the 1 MB / 6 s defaults.

## Errors

- Unknown user: the API answers `null` with HTTP 200; the owner sees "Hacker
  News has no user called name (usernames are case-sensitive)."
- Outages go through to the host, which keeps the last good value.

## Develop

```bash
bun test plugins/hackernews
```
