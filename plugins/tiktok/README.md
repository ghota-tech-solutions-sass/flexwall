# TikTok

A Flexwall plugin that reads verified numbers from the owner's own TikTok
account. The owner signs in with TikTok (Login Kit for Web); nothing is typed.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `tiktok` | Free, verified. Sign in with TikTok (OAuth v2). |

All four metrics come from one call:
`GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count,following_count,likes_count,video_count`
with `Authorization: Bearer <token>`.

| Metric | Type | Field |
|---|---|---|
| `followers` | number, count, audience leaderboard | `follower_count` |
| `likes` | number, count | `likes_count`: likes across the account's videos |
| `videos` | number, count | `video_count` |
| `following` | number, count | `following_count` |

A field TikTok leaves out becomes `null` for that metric.

## Sign-in and permissions

- Authorize: `https://www.tiktok.com/v2/auth/authorize/?client_key=…&response_type=code&scope=user.info.basic,user.info.stats&redirect_uri=…&state=…`
  (scopes comma-separated, commas left unencoded as in TikTok's examples).
- Token: `POST https://open.tiktokapis.com/v2/oauth/token/`, form-encoded
  `client_key`, `client_secret`, `code`, `grant_type=authorization_code`,
  `redirect_uri`. The client secret only ever travels in this POST body.
- Identity at sign-in: user info with `fields=open_id,display_name`.
  `accountId` is the `open_id` (per app, per user); the label is
  `TikTok (<display name>)`.

**Scopes:**

- `user.info.basic`: open id and display name, for the connection label.
- `user.info.stats`: follower, following, likes and video counts.

If the token comes back without `user.info.stats` (the owner unticked it),
connecting fails with "Reconnect TikTok and allow Flexwall to read your profile
statistics." before any profile read.

**PKCE:** TikTok documents `code_verifier` as "required for mobile and desktop
app only". This is a web app with a server-side client secret, so no PKCE is
sent.

**Declined or ineligible:** `error=access_denied` becomes "You declined to
connect TikTok."; any other `error` (TikTok documents it as "the current user is
not eligible for using third-party login") gets a sentence saying so.

## Token lifetimes and refresh

- Access tokens: 24 hours (`expires_in: 86400`). `expiresAt` is set from it.
- Refresh tokens: 365 days (`refresh_expires_in`).
- Refresh: `POST https://open.tiktokapis.com/v2/oauth/token/` with
  `grant_type=refresh_token`, form-encoded. TikTok: "The returned
  `refresh_token` may be different than the one passed in the payload. You
  must use the newly-returned token". The newest one is always stored.
- A refused refresh (4xx, or an `error` field in the answer, e.g.
  `invalid_grant`) becomes "Reconnect TikTok: the sign-in was revoked or has
  expired." After 365 days without reconnecting, that's what the owner sees.

## Removing a connection

`disconnect` sends `POST https://open.tiktokapis.com/v2/oauth/revoke/` (form
`client_key`, `client_secret`, `token` = the access token), read as text. An
`access_token_invalid`, `invalid_grant` or `invalid_token` error, or a 401,
counts as already revoked; no app keys or no stored access token means nothing
is sent. An access token that expired unrefreshed can't revoke the grant: it
then lapses with its refresh token, or the owner removes Flexwall in TikTok's
"Manage app permissions".

## Errors

TikTok puts `error.code` in the JSON of both successful and failed calls;
every call reads it from the body or from the HTTP error's body.

| From TikTok | Handling |
|---|---|
| `access_token_invalid` (401) | `ExpiredCredentialsError`: the host refreshes and retries once |
| `scope_not_authorized` (401), `scope_permission_missed` (400) | "Reconnect TikTok and allow Flexwall to read your profile statistics." |
| `rate_limit_exceeded` (429), `internal_error` (500), anything else | passed through; tiles keep their last value |
| Missing `TIKTOK_CLIENT_KEY` or `TIKTOK_CLIENT_SECRET` | "This Flexwall server has no TikTok app.", before any request (sign-in and refresh; `fetch` only needs the owner's token) |

Error messages never include TikTok's response body, request URLs, codes or
tokens.

## Limits

The `ttl` is one hour: follower and like counts move slowly for nearly every
account, and one call an hour per connection is far below TikTok's per-minute
rate limits.

## Operator setup

1. Sign in at [TikTok for Developers](https://developers.tiktok.com), open
   **Manage apps** and create an app (an individual or organization developer
   account works). Fill in the app icon, name, category, description, terms of
   service URL and privacy policy URL; review needs them.
2. Add the **Login Kit** product, platform **Web**, and register the redirect
   URI `https://flexwall.lol/api/connections/oauth/callback` (TikTok requires
   absolute `https`, static, no query string or `#`, under 512 characters, at
   most 10 URIs).
3. Add the scopes `user.info.basic` and `user.info.stats`.
4. Copy the **Client key** and **Client secret** into `TIKTOK_CLIENT_KEY` and
   `TIKTOK_CLIENT_SECRET`.

**Before other people can connect:** a new app works in **Sandbox** only,
where at most 10 TikTok accounts added as target users can authorize it. For
everyone else, submit the production app for **App Review** with the scopes
above, explaining that Flexwall shows the owner's own follower, like and video
counts on their public wall, with a demo video of the sign-in and the tile.
Until TikTok approves it, other accounts can't complete the sign-in.

## Not verified against a real account

Built from TikTok's documentation and examples, without an approved app:

- the `error` value TikTok sends when the owner presses Cancel (assumed
  `access_denied`);
- whether the token endpoint reports a bad code or refresh token with an HTTP
  error status or inside a 200 answer (both are handled);
- that the `scope` in the token response lists only the scopes the owner kept;
- how long App Review takes and what it asks of an app that only reads
  `user.info.stats`;
- whether `likes_count` counts likes on videos later deleted or made private;
- the error the revoke endpoint returns for an expired or already revoked token
  (the codes above are assumed).

## Develop

```bash
bun test plugins/tiktok
bunx tsc --noEmit -p plugins/tiktok/tsconfig.json
```

Fixtures in `tests/fixtures` follow TikTok's documented examples; the display
name, counts and rotated tokens are invented.
