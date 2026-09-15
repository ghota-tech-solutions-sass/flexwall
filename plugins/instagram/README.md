# Instagram

A Flexwall plugin that reads verified numbers from the owner's own Instagram
**professional** account (Creator or Business), through the Instagram API with
Instagram Login. The owner signs in with Instagram; nothing is typed.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `instagram` | Free, verified. Sign in with Instagram (OAuth). |

All three metrics come from one call:
`GET https://graph.instagram.com/v25.0/me?fields=followers_count,follows_count,media_count`
with `Authorization: Bearer <token>`.

| Metric | Type | Field |
|---|---|---|
| `followers` | number, count, audience leaderboard | `followers_count` |
| `following` | number, count | `follows_count` |
| `posts` | number, count | `media_count`: media on the profile, as Instagram counts it |

A field Instagram leaves out becomes `null` for that metric. The API version
is pinned to `v25.0`, the version in Meta's Instagram Login examples; `v26.0`
exists (July 2026), and v25.0 stays supported for about two years after its
February 2026 release.

## Sign-in and permissions

1. Authorize: `https://www.instagram.com/oauth/authorize?client_id=…&redirect_uri=…&response_type=code&scope=instagram_business_basic&state=…`
2. Short-lived token (one hour): `POST https://api.instagram.com/oauth/access_token`,
   form-encoded `client_id`, `client_secret`, `grant_type=authorization_code`,
   `redirect_uri`, `code`. A trailing `#_` on the code is stripped, as Meta
   instructs. The answer is read both wrapped in `data: [ … ]` (Meta's example)
   and flat.
3. Long-lived token (60 days), straight away:
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=…&access_token=<short-lived>`.
4. Identity: `GET /v25.0/me?fields=user_id,username,account_type`. `accountId`
   is `user_id` (the professional account id); the label is
   `Instagram (@username)`. An `account_type` other than `BUSINESS` or
   `MEDIA_CREATOR` is refused with a sentence asking to switch to a
   professional account.

**Scope:** `instagram_business_basic` only (the current name; the old
`business_basic` values were deprecated on 27 January 2025). If Meta's
`permissions` list comes back without it, connecting fails with "Reconnect
Instagram and allow Flexwall to read your profile."

**PKCE:** Meta doesn't document PKCE for Instagram Login; none is sent.

**Declined:** Instagram redirects with `error=access_denied&error_reason=user_denied`,
which becomes "You declined to connect Instagram."

### Secrets in URLs, by Meta's design

Meta documents two calls with credentials in the query string and no
alternative:

- the long-lived exchange carries the **app secret** and the short-lived token;
- the refresh carries the long-lived token.

Nothing logs these URLs. When either call fails with an outage or a rate
limit, the `HttpError` is rethrown with the URL reduced to its path and the
body dropped, so neither can reach a log through the error. Tests check that
the app secret appears in the exchange URL only, and that the profile call
sends the token in a header. Every other credential goes in a POST body or an
`Authorization` header.

## Token lifetimes and refresh

- Short-lived token: one hour, used once for the exchange and dropped.
- Long-lived token: 60 days (`expires_in: 5183944` in Meta's example).
  `expiresAt` is set from it and `secret.issuedAt` records when it was issued.
- Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`
  gives another 60 days. It needs no app secret, so it works even without
  `INSTAGRAM_APP_SECRET`. Meta only refreshes a token that is **at least 24
  hours old** and not expired.
- **Too young:** when `issuedAt` is under 24 hours ago, `refresh` makes no
  request and returns the same secret with `expiresAt` 25 hours after issue,
  so the host comes back once a refresh can work. This is decided from
  `issuedAt`, not from Meta's answer, whose shape for this case isn't
  documented.
- A refused refresh (a 4xx such as error 190) becomes "Reconnect Instagram: the
  sign-in expired or was revoked." A token not refreshed within its 60 days
  can't be refreshed at all; the owner reconnects.

## Errors

| From Meta | Handling |
|---|---|
| `code` 190 or 102 (subcode 463 expired, 467 invalid, or none) | `ExpiredCredentialsError`: the host refreshes and retries once |
| `code` 190 with subcode 460 (password changed) or 458 (app removed) | "Reconnect Instagram: the sign-in expired or was revoked." |
| `code` 10 or 200–299 (permission) | "Reconnect Instagram and allow Flexwall to read your profile." |
| `code` 4, 17, 32, 613 (rate limits), 5xx, anything else | passed through; tiles keep their last value |
| Code already used at the token endpoint | "Instagram refused this sign-in…" |
| Missing `INSTAGRAM_APP_ID` or `INSTAGRAM_APP_SECRET` | "This Flexwall server has no Instagram app.", before any request (sign-in only) |

Error messages never include Meta's response body, request URLs, codes or
tokens.

## Limits

The `ttl` is one hour: follower counts move slowly, and one call an hour per
account is far below Meta's per-account call budget for the Instagram API.

## Operator setup

1. In [Meta for Developers](https://developers.facebook.com/apps), create an
   app of type **Business**, and add the **Instagram** product.
2. Open **Instagram → API setup with Instagram business login**. Under
   **Set up Instagram business login → Business login settings**, add the OAuth
   redirect URI `https://flexwall.lol/api/connections/oauth/callback`.
3. Copy the **Instagram app ID** and **Instagram app secret** shown there
   (they differ from the Meta app's own ID and secret) into `INSTAGRAM_APP_ID`
   and `INSTAGRAM_APP_SECRET`.
4. The only permission needed is `instagram_business_basic`.

**Before other people can connect:** with Standard Access, only Instagram
accounts that have a role on the app (added under **App roles → Roles** as
Instagram testers, and accepted in Instagram's settings) or on a business that
claimed it can sign in. To serve anyone else, request **Advanced Access** for
`instagram_business_basic` through **App Review** (a screencast of the sign-in
and the tile, and why Flexwall needs the owner's follower count), and complete
**Business Verification**. The app also needs to be switched to **Live** mode
with a privacy policy URL.

## Not verified against a real account

Built from Meta's documentation and examples, without an approved app:

- whether real answers from the token endpoint and `/me` are wrapped in
  `data: [ … ]` as Meta's examples show (both shapes are read);
- the `account_type` values (`BUSINESS`, `MEDIA_CREATOR` assumed from the
  docs' "Business" and "Media_Creator") and whether a personal account even
  gets through Business Login or is stopped by Instagram first;
- the error Meta returns when refreshing a token under 24 hours old (avoided
  by never asking);
- which error code and HTTP status an expired token gets on
  `graph.instagram.com` (Graph API's documented 190/463 assumed);
- whether `media_count` includes archived posts or stories.

## Develop

```bash
bun test plugins/instagram
bunx tsc --noEmit -p plugins/instagram/tsconfig.json
```

Fixtures in `tests/fixtures` follow Meta's documented examples; usernames,
ids, counts and tokens are invented.
