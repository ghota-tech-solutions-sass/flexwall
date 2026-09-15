# Powens

A Flexwall plugin that reads verified balances of an owner's French (and
Spanish) bank accounts, livrets, PEA, brokerage accounts, life insurance and
retirement plans through [Powens](https://www.powens.com) (formerly Budget
Insight) and its Connect webview.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `powens` | Pro, verified. The owner picks their institution in Powens' webview and shares accounts; Flexwall reads balances only. |

| Metric | Type | What |
|---|---|---|
| `net-worth` | Money (EUR). Sensitive. Wealth leaderboard. | `cash` + `investments` − amounts owed on loans and cards |
| `cash` | Money (EUR). Sensitive. | Current and savings accounts, livrets included |
| `investments` | Money (EUR). Sensitive. | Brokerage, PEA, life insurance, capitalisation, retirement and employee savings |
| `accounts` | Count | Active accounts (enabled, not deleted, not hidden), in any currency |

All four come from the same two requests (one `cacheKey`).

## How connecting works

1. `authorize`
   - `POST https://{domain}.biapi.pro/2.0/auth/init` with
     `{ client_id, client_secret }`. Both given, Powens creates a user and
     returns a **permanent** `auth_token` and `id_user`.
   - `GET /2.0/auth/token/code?type=singleAccess` with
     `Authorization: Bearer <auth_token>` returns a temporary `code`
     (`singleAccess` is what Powens recommends for the webview).
   - The owner is sent to
     `https://webview.powens.com/fr/connect?domain={domain}.biapi.pro&client_id=…&redirect_uri=…&code=…&state=…&connector_capabilities=bankwealth`.
   - `carry`: `{ token, user }`. The token is sealed in the host's HttpOnly
     cookie, never put in the URL.
2. The owner picks an institution, signs in there and chooses accounts (the
   webview activates them: Powens disables accounts until the owner consents).
3. `complete`
   - `error=access_denied`: "You cancelled in Powens, so nothing was
     connected." `tos_declined`: "You declined Powens' terms…". Any other
     error (`server_error`, future codes): Powens' `error_description`, cut to
     200 characters.
   - No `connection_id`, or a connection id the user doesn't have: "Powens
     didn't finish connecting your bank. Try again."
   - `GET /2.0/users/me/connections?expand=connector` and
     `GET /2.0/users/me/accounts`. No active account: refused.
   - `secret`: `{ token }`. `public`: `{ banks, accounts }` (connector names,
     active account count). `label`: "Boursorama (4 accounts)".
   - `accountId`: the Powens user id (`id_user` from `/auth/init`, else the
     connection's `id_user`, else the connection id).
   - No `expiresAt` and no `refresh`: the user token is permanent.

### Why only `bankwealth`

The webview's `connector_capabilities` takes a comma-separated list, but
Powens documents it as a filter on connectors exposing **all** the values
(AND), not any. `bank,bankwealth` would narrow the list instead of widening it.
Leaving it out means `bank` (current and savings only, no PEA or life
insurance). The plugin sends `bankwealth` alone (`CONNECTOR_CAPABILITIES`).

## How the numbers are computed

`GET /users/me/accounts` (without `?all`, so Powens already hides disabled and
deleted accounts). Accounts with `disabled` or `deleted` set, or
`display: false` ("included in aggregated metrics" in Powens' model), are left
out anyway. Accounts with no numeric `balance` are skipped in sums.

Account `type` (from Powens' `AccountTypeName` list; read from a string or an
object's `name`):

| Category | Types |
|---|---|
| Cash | `checking`, `savings`, `deposit`, `joint` (deprecated), `livret_a`, `livret_b`, `ldds`, `cel`, `pel`, `csl`, `cat` |
| Investments | `market`, `pea`, `lifeinsurance`, `capitalisation`, `per`, `perp`, `perco`, `madelin`, `article83`, `pee`, `rsp`, `crowdlending`, `real_estate`, `crypto` (not in Powens' list, kept defensively) |
| Debt | `loan`, `consumercredit`, `revolvingcredit`, `card` |
| Left out (logged) | `unknown` and anything else |

**Net worth** = sum of cash balances + sum of investment balances − sum of
`|balance|` of debt accounts. Powens doesn't document the sign of loan and
card balances, so the amount owed is the absolute value whatever the sign.
Rounded to the cent.

**One currency: EUR.** `currency.id` (or a bare code) must be `EUR`; accounts in
another currency, or without one, are left out of the sums and counted in a log
line. Nothing is converted. They still count in `accounts`.

Investment balances are what Powens reports as `balance`; with Wealth
features, Powens also exposes `valuation`, which isn't used.

## Errors

| Situation | Result |
|---|---|
| `POWENS_DOMAIN`, `POWENS_CLIENT_ID` or `POWENS_CLIENT_SECRET` missing | "This Flexwall server has no Powens app.", before any request |
| `POWENS_DOMAIN` not a name or `*.biapi.pro` host | "This Flexwall server's POWENS_DOMAIN isn't a Powens domain." |
| `/auth/init` 400/401/403 | "Powens refused this Flexwall server's client application." |
| Any connection of the user in `state` `SCARequired`, `webauthRequired`, `additionalInformationNeeded`, `decoupled`, `wrongpass`, `passwordExpired`, `actionNeeded` | "Reconnect <bank> in Powens: <why>." for **every** metric, `accounts` included: balances from a bank that stopped syncing would silently go stale. Tiles keep their last value, marked stale. |
| Callback came back but the fresh token is refused (401/403) | "Powens refused the connection it just made. Try again later." |
| Connection `state` `validating`, `rateLimiting`, `websiteUnavailable`, `bug`, or an unknown state | Logged; the last synced balances are returned |
| The user has no connection any more | "Reconnect Powens: your bank connection was removed there." |
| 401/403 on user endpoints (token revoked, user deleted) | "Reconnect Powens: it no longer accepts this connection." |
| 429, 5xx, anything else | Passed through: tiles keep their last value |

The Reconnect webview (`https://webview.powens.com/{lang}/reconnect?domain=…&client_id=…&redirect_uri=…&code=…&connection_id=…`)
exists, but the Flexwall host has no flow for it yet: "reconnect" today means
connecting again in Flexwall, which creates a new Powens user.

## Limits

Powens synchronizes each connection in the background **every 24 hours by
default**; reading the API doesn't reach the bank. `ttl` is **6 hours**: fresh
enough to catch the daily sync within a few hours, at 8 pairs of requests a
day per connection. Sandbox fair usage is 30 calls a minute, 86,400 a day.

## Operator setup

1. Sign up at <https://console.powens.com>, create an organization, then a
   **sandbox** domain (suffixed `-sandbox.biapi.pro`, **limited to 50
   connections**). The "Connecteur de test" connector accepts any username and
   password `1234`.
2. Add a **client application** (Client Applications). Add the redirect URI
   `https://flexwall.lol/api/connections/oauth/callback` (your own origin when
   self-hosting). Keep the Client ID and Client secret.
3. **Activate connectors** for the products you use, including wealth
   institutions (brokers, insurers).
4. **Wealth & Loans** (market accounts, PEA, life insurance, retirement,
   loans) is activated by your Powens **Account Manager only**, per domain; ask
   for it, or `bankwealth` institutions and wealth accounts may be missing.
5. **Production** needs a signed contract; a production domain is requested
   through your customer success manager.
6. Server environment (in `CONNECTOR_ENV`, `connector_secrets` and
   `docs/self-hosting.md`):
   - `POWENS_DOMAIN`: the domain name without `.biapi.pro`
     (`flexwall-sandbox`); a full `flexwall-sandbox.biapi.pro` is accepted.
   - `POWENS_CLIENT_ID`
   - `POWENS_CLIENT_SECRET`: only ever sent in the `/auth/init` body.

### Billing and clean-up

- **Every "Connect a French bank" click creates one permanent Powens user**
  (`/auth/init` with the client secret makes the token permanent at once), even
  if the owner closes the webview. Abandoned attempts leave empty users.
- Each Flexwall connection is one Powens user with, normally, one connection.
  Reconnecting creates another user, so a second Flexwall connection (the
  `accountId` differs).
- Removing the connection in Flexwall **doesn't delete the Powens user yet**
  (`DELETE /2.0/users/me` exists, the host has no removal hook). Delete users
  from the console or the API (users token) until it does.

## Not verified against a real account

Fixtures follow Powens' documented examples (accounts example of the
Transactions guide, the `expand=connector` example of API design), extended;
no response was recorded.

- The sign of `balance` for `loan`, `consumercredit`, `revolvingcredit` and
  `card` accounts (handled sign-agnostically), and whether a card balance is
  debt or available credit.
- `type` and `currency` shapes: the reference says objects (`AccountType`,
  `Currency`), examples show `"type": "checking"`; both are accepted.
- Whether `bankwealth` connectors also return checking and savings accounts,
  and whether `bank,bankwealth` really yields an empty or narrowed list.
- What the webview shows with `connector_capabilities=bankwealth` on a domain
  without Wealth & Loans activated.
- Whether `crypto` ever appears as an account type.
- Whether `expand=connector` works on the connections list (documented on a
  single connection); without it the label falls back to "Powens" and errors
  say "your bank".
- The HTTP status for a revoked or deleted user token (401 assumed, 403
  handled too), and for bad client credentials on `/auth/init`.
- Whether `display: false` accounts should be excluded (the model says it
  controls aggregated metrics).
- Whether an account's `balance` for life insurance equals its `valuation`.
- Billing per user versus per connection, and whether empty users cost anything.

## Develop

```bash
bun test plugins/powens
bunx tsc --noEmit -p plugins/powens/tsconfig.json
```
