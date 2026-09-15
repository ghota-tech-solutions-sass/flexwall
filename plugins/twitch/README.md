# Twitch

A Flexwall plugin that reads verified numbers from the owner's own Twitch
channel. The owner signs in with Twitch; nothing is typed.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `twitch` | Free, verified. Sign in with Twitch (OAuth). |

| Metric | Type | Where it comes from |
|---|---|---|
| `followers` | number, count, audience leaderboard | `total` from `GET https://api.twitch.tv/helix/channels/followers?broadcaster_id=<id>` |
| `subscribers` | number, count | `total` from `GET https://api.twitch.tv/helix/subscriptions?broadcaster_id=<id>&first=1`. No value when the token lacks the scope or Twitch refuses the list (a channel that isn't Affiliate or Partner). |
| `live` | text | `"Live"` when `GET https://api.twitch.tv/helix/streams?user_id=<id>` lists a stream of type `live`, `"Offline"` otherwise. |
| `viewers` | number, count | `viewer_count` of that stream, `0` when offline. |

There's no total views metric: `view_count` on Get Users is deprecated and
Twitch says its data "is not valid and should not be used".

Each fetch first calls `GET https://id.twitch.tv/oauth2/validate`
(`Authorization: OAuth <token>`), which Twitch requires of apps that keep OAuth
sessions ("on startup and hourly thereafter"). Its answer gives the channel id
and granted scopes, so no extra Get Users call is needed. Then only the Helix
reads the requested metrics need run, in parallel. Helix calls send the
`Client-Id` header and `Authorization: Bearer <token>`.

## Sign-in and permissions

Authorization code flow for a confidential client:

- Authorize: `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=channel:read:subscriptions&state=…`
- Token: `POST https://id.twitch.tv/oauth2/token`, form-encoded `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`. The client secret only ever travels in this POST body.
- Identity at sign-in: `GET https://api.twitch.tv/helix/users` with the new token. `accountId` is the user id; the label is `Twitch (<display name>)`.

**Scope:** `channel:read:subscriptions` only, always requested (one consent
screen, and subscribers work the day a channel becomes Affiliate).
`moderator:read:followers` is **not** requested: Get Channel Followers returns
`total` to any user token and only the follower list needs that scope. Get
Streams needs no scope.

**PKCE:** Twitch doesn't document PKCE for the authorization code flow, so
none is sent; the client secret stays on the server and the host checks
`state`.

**Declined:** Twitch redirects with `error=access_denied`, which becomes
"You declined to connect Twitch."

## Token lifetimes and refresh

- Access tokens last about four hours (`expires_in`, 14,124 s in Twitch's
  example). `expiresAt` is set from it so the host refreshes ahead of time.
- `POST https://id.twitch.tv/oauth2/token` with `grant_type=refresh_token`,
  form-encoded. Twitch says refresh tokens **may change**: the new one is kept
  when sent, the old one otherwise.
- Refresh tokens of confidential clients mostly don't expire; they stop working
  when the owner disconnects the app or changes their password. Twitch answers
  400 or 401 `Invalid refresh token`, which becomes
  "Reconnect Twitch: the sign-in was revoked or can no longer be renewed."
- A `401` from `/validate`, or a 401 from Helix whose message isn't about a
  scope, a moderator or a mismatched broadcaster, throws
  `ExpiredCredentialsError` so the host refreshes and retries once.

## Errors

- Missing `TWITCH_CLIENT_ID` or `TWITCH_CLIENT_SECRET`: "This Flexwall server has
  no Twitch app.", before any request (`fetch` only needs the client id).
- A code Twitch refuses at the token endpoint: "Twitch refused this sign-in…"
- A subscriptions answer of 400, 401 (scope), 403 or 404: `subscribers` is
  `null` rather than an error tile.
- 429 and 5xx: passed through; tiles keep their last value.

Error messages never include Twitch's response body, request URLs, codes or
tokens.

## Limits

Helix gives each app a bucket of 800 points a minute. The `ttl` is 15 minutes,
set by live status, the fastest-moving metric: `live` and `viewers` can lag by
up to that much. A full refresh costs four requests.

## Operator setup

1. Enable two-factor authentication on the Twitch account that will own the app
   (Twitch requires it to register applications).
2. In the [Twitch developer console](https://dev.twitch.tv/console/apps), click
   **Register Your Application**. Name it, set **OAuth Redirect URLs** to
   `https://flexwall.lol/api/connections/oauth/callback` (or your own host's
   `/api/connections/oauth/callback`), pick a category, and choose the
   **Confidential** client type.
3. Open the app, copy the **Client ID**, and click **New Secret** for the
   client secret.
4. Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in the server environment.

Scopes are requested at sign-in, not configured on the app. Twitch has no app
review for `channel:read:subscriptions`: any Twitch account can connect as
soon as the app exists. Keep the hourly validation requirement in mind: Twitch
audits apps for it.

## Not verified against a real account

Built from Twitch's documentation and examples, without a registered app:

- that `/helix/subscriptions` for a channel that isn't Affiliate or Partner
  answers an error (handled as `null`) rather than `total: 0`;
- whether the subscriber `total` counts the broadcaster's own subscription;
- the exact message of a Helix 401 for an expired token (documented for
  `/validate` as `invalid access token`; Helix is assumed to say
  `Invalid OAuth token`, and anything not about scopes is treated as expired);
- that followers `total` is returned to a token without `moderator:read:followers`
  (documented, not observed);
- that validating on each fetch, rather than on a server-side hourly timer,
  satisfies Twitch's audit when no one views a wall for hours.

## Develop

```bash
bun test plugins/twitch
bunx tsc --noEmit -p plugins/twitch/tsconfig.json
```

Fixtures in `tests/fixtures` are Twitch's documented examples.
