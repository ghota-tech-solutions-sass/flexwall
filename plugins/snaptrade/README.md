# SnapTrade

A Flexwall plugin that reads verified values of an owner's brokerage accounts,
worldwide, through [SnapTrade](https://snaptrade.com)'s Connection Portal.
Supported brokerages: <https://support.snaptrade.com/brokerages>.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `snaptrade` | Pro, verified. The owner connects a brokerage in SnapTrade's portal; Flexwall reads values only, over a read-only connection. |

| Metric | Type | What |
|---|---|---|
| `portfolio-value` | Money, sensitive, wealth leaderboard | Sum of `balance.total` (cash plus holdings, as the brokerage reports it) of the counted accounts, in the currency rule below |
| `cash` | Money, sensitive | Sum of `cash` of the counted accounts' balances, same currency as `portfolio-value` |
| `accounts` | Count | Counted accounts |

All three share one cache group.

**Counted accounts**: every account of `GET /accounts` except paper accounts
(`is_paper`), `closed` or `archived` ones, and lines of credit
(`account_category: "LOC"`, debt rather than wealth). `DEPOSIT` accounts (cash
at the brokerage) count; `null` categories count, as SnapTrade advises.

**Currency rule**: SnapTrade reports each account in its own currency and
gives no common one. The currency of the **largest account** (highest
`balance.total.amount`) wins, and only accounts in that currency are added;
the others are left out and logged. Nothing is converted, like every wealth
connector: the leaderboard compares amounts without converting. `cash` adds
the balances in that same currency (a multi-currency account has one balance
per currency); if no cash is held in it, the largest cash balance's currency
is used. An account with a `null` total is skipped; with no usable total at all
the metric is empty (`null`).

## How connecting works

1. `authorize`
   - `POST /snapTrade/registerUser` `{ userId }` with a fresh
     `flexwall-<uuid>` id. The answer carries the user's `userSecret`.
   - `POST /snapTrade/login?…&userId&userSecret` with
     `{ connectionType: "read", customRedirect, immediateRedirect: true }`.
     `customRedirect` is the host callback with `state` added as a query
     parameter; `immediateRedirect` sends the owner straight back instead of
     showing SnapTrade's finish screen. The answer's `redirectURI` (valid 5
     minutes) is where the owner goes.
   - `carry` is `{ userId, userSecret }`, sealed by the host in its cookie. The
     portal URL holds neither.
2. The owner picks a brokerage and signs in there. SnapTrade redirects back with
   `status=SUCCESS&connection_id=…`, `status=ERROR&status_code=…&error_code=…`
   or `status=ABANDONED`. **Cancelling the portal sends back only `state`, with
   no `status`** (verified live, 2026-09-15).
3. `complete`
   - `ABANDONED`: "You left SnapTrade before connecting a brokerage…".
   - `ERROR`: a sentence per `error_code` (`1066` credentials refused, `3000`
     brokerage unreachable, `1006` session expired, otherwise generic).
   - Then `GET /authorizations` and `GET /accounts`. No connection (a cancelled
     portal lands here): "No brokerage was connected." Existence comes from connections, because a new
     connection's accounts can lag its first sync (the account count may then
     read 0 in the connection list until the next connect).
   - `secret`: `{ userId, userSecret }`. `public`: `{ brokerages, accounts }`.
     `label`: brokerage names, e.g. "Fidelity, Wealthsimple". `accountId`: the
     SnapTrade `userId`.
   - No `expiresAt`, no `refresh`: SnapTrade keeps connections alive; a broken
     one is reported as `disabled`.
   - Whenever `complete` throws because nothing was connected (`ABANDONED`,
     `ERROR`, no connection), it first deletes the user `authorize` registered
     (`DELETE /snapTrade/deleteUser`, as in "Removing a connection"), so it isn't
     billed. Best effort: a failure is logged (status only, no id or secret) and
     the owner gets the same sentence.

Because every sign-in registers a new SnapTrade user, **connecting again
creates a second Flexwall connection** (a new `accountId`) and a second
SnapTrade user rather than replacing the first. The owner should remove the old
one.

## Fetching

Every pass: `GET /authorizations` and `GET /accounts`, in parallel.
`GET /authorizations` isn't redundant: a disabled connection keeps answering
with its last cached numbers and no error, and its `disabled` flag is the only
way to know. Any disabled connection ends the pass with "Reconnect
&lt;brokerage&gt; in SnapTrade: the brokerage stopped sharing, so the numbers
would be out of date. Connect your brokerage again." (tiles keep their last
value, marked stale).

`cash` alone adds `GET /accounts/{id}/balances` per counted account, in
parallel, for the first **10** accounts at most (logged when capped: the number
is then a floor). `portfolio-value` and `accounts` never read balances.

For accounts whose holdings the brokerage doesn't expose
(`sync_status.holdings.holdings_unavailable`, e.g. Vanguard employer plans),
`portfolio-value` still uses the brokerage's total, but `cash` may be understated.

## Removing a connection

`disconnect` sends a signed `DELETE /snapTrade/deleteUser?clientId&timestamp&userId`
(no `userSecret`, `content: null`); SnapTrade queues the deletion and answers 200.
A 404, code `1083` or a "user not found" body counts as already deleted; no
server app or no stored user id means nothing is sent.

## Signing

Commercial API key authentication. Every request carries the query parameters
`clientId` and `timestamp` (Unix seconds), plus `userId` and `userSecret` for
user calls, and a `Signature` header: base64 of HMAC-SHA256, keyed with the
consumer key, over the canonical JSON (keys sorted at every level, no
whitespace) of

```json
{ "content": <JSON body or null>, "path": "/snapTrade/login", "query": "clientId=…&timestamp=…&userId=…&userSecret=…" }
```

The query string is built once and used both in the URL and in `query`.
Requests without a body (all GETs) sign `content: null`. POST bodies are sent
as the same canonical JSON. WebCrypto only.

Paths are sent and signed **without** `/api/v1` (`https://api.snaptrade.com/snapTrade/login`),
like the current official SDKs (`BASE_PATH = "https://api.snaptrade.com"`,
"strip `/api/v1`… in request signature generators", June 2026). The Request
Signatures guide still shows `/api/v1` paths; both prefixes route to the same
endpoints (checked with probes carrying a dummy client id and signature, which answer
`{"detail":"Unable to verify signature sent","status_code":401,"code":"1076"}`
on both). The SDKs pass the consumer key through `encodeURI` before HMAC; this
connector does too (no change for URL-safe keys).

Tests check the canonicalizer byte for byte against the canonical string the
guide prints, and recompute every signature with a second HMAC implementation
(`node:crypto`) with an injected clock and user id. SnapTrade publishes no
expected signature value.

**The user secret travels in the query string.** SnapTrade accepts `userId` and
`userSecret` only as query parameters, not headers. Error messages and logs
never include the request URL or the response body.

## Errors

SnapTrade error bodies look like `{"detail": "...", "status_code": 401, "code": "1076"}`
(`default_code` in some reference examples; both are read).

| Answer | Result |
|---|---|
| A body mentioning throttling, a rate limit or a quota | Passed through |
| 401 with `code` `1076` (signature) | "SnapTrade refused this Flexwall server's API key." |
| `code` `1083` (invalid userId or userSecret) | "SnapTrade no longer knows this connection. Remove it and connect your brokerage again." |
| Any other 401: on a user call (e.g. `0000` "User not found") / on `registerUser` | The "no longer knows this connection" sentence / the API key sentence |
| 403 (e.g. `1066`, missing permission) | "SnapTrade refused this Flexwall server's API key." |
| 400, including `1076` "Unable to verify data sent" | Passed through: a request problem, not the key |
| HTTP 402 | "This Flexwall server's SnapTrade plan doesn't allow this. Ask its operator." |
| A connection with `disabled: true` | "Reconnect &lt;brokerage&gt; in SnapTrade: …" |
| No connection left | "No brokerage was connected. Connect your brokerage again." |
| 429, 503 (`3002`, brokerage busy syncing), anything else | Passed through |

Missing `SNAPTRADE_CLIENT_ID` or `SNAPTRADE_CONSUMER_KEY`: "This Flexwall server
has no SnapTrade app.", before any request.

## Limits

- `ttl` is **6 hours**. `GET /accounts` serves Daily data on every SnapTrade
  plan (cached, refreshed once a day), and Daily plans refresh balances once a
  day too, so reading more often can't show anything new; 6 hours picks up the
  daily sync the same day.
- Rate limits: 250 requests a minute per client id (customer level). The
  10-a-minute per-account limit applies to Personal keys only. A pass is 2
  requests, plus one per account (10 at most) with `cash`.
- 429s pass through; the host keeps the last value.

## Operator setup

1. Create a **Commercial** account on the SnapTrade Dashboard
   (<https://dashboard.snaptrade.com/signup>), verify the email and enable
   two-factor authentication. Personal API keys don't work here: they must not
   call `registerUser`.
2. Create a test API key on the API Key page
   (<https://dashboard.snaptrade.com/api-key>). For production, complete
   SnapTrade's approval (KYC) and billing steps, then create a production key.
3. Server environment:
   - `SNAPTRADE_CLIENT_ID`: the client id.
   - `SNAPTRADE_CONSUMER_KEY`: the consumer key. Server only; it signs every call.
   Both must be in the variables plugins may read (`CONNECTOR_ENV` in
   `apps/web/src/composition.ts`), in `connector_secrets` in Terraform, and in
   `docs/self-hosting.md`.
4. Redirect: the connector passes `https://<your origin>/api/connections/oauth/callback?state=…`
   as `customRedirect` on each login link. SnapTrade's docs describe no
   allow-list for it; if the dashboard asks for a redirect URL, use that callback.
5. Choose the **Daily** data plan: this connector is read-only and reads once
   every 6 hours, so Real-time data buys nothing.

### Cost

Pricing as published on <https://snaptrade.com/pricing> (September 2026):

- **Starter**: $0, 5 connected accounts, for building and testing.
- **Pay as you go, Daily**: $1 per connected user a month, read-only, manual
  sync $0.05 each (this connector never calls it).
- **Pay as you go, Real-time**: $2 per connected user a month.
- Custom plans on request. The billing guide gives $2.00 per connected user a
  month as the Commercial default.

A user is billed for a month when it had at least one completed brokerage
connection or sync in it; incomplete connections aren't billed.

- **Every Flexwall connection registers one SnapTrade user**, so each is one
  billed connected user, whatever the number of brokerages behind it.
  Reconnecting creates another one.
- **Removing a connection in Flexwall deletes its SnapTrade user** (see
  "Removing a connection"), which ends its bill. If that call fails (outage,
  refused key), the host still removes the connection and logs it: delete the
  user from the SnapTrade Dashboard or its API. Users registered by abandoned
  sign-ins are deleted when the owner comes back to Flexwall; an owner who never
  comes back leaves an unbilled user with no connection listed.

## Not verified against a real account

- **How SnapTrade appends its return parameters to a `customRedirect` that
  already has a query string.** Its docs write `{your_redirect_url}?status=…`.
  If it adds a second `?` instead of `&`, the host's `callbackQuery` splits
  `<state>?status=SUCCESS` back into `state` and `status`, so connecting still
  works; check it once with a test key anyway.
- Whether SnapTrade requires the redirect address to be allow-listed in the
  dashboard.
- Fixtures follow the API reference examples, trimmed; no response was recorded.
- Signatures were never accepted by the live API with a real key: the scheme
  follows the guide and the SDK source, and only probes with a dummy client id and signature were sent.
- That unprefixed paths stay supported, and that `1083` is what a deleted user
  or rotated secret returns on every user endpoint (seen on a dummy probe
  of `GET /accounts`).
- The status and body of plan-limit refusals (402 is assumed), and whether any
  401 on a user call can mean something other than a bad user id or secret.
- Whether `GET /authorizations` lists the new connection the moment the portal
  redirects with `SUCCESS`, and how long `GET /accounts` lags it.
- Whether `balance.total` includes margin debt or credit balances for every
  brokerage, and whether `DEPOSIT` accounts double count cash already in an
  investment account.
- The exact `ERROR` codes the portal sends back in the redirect beyond the
  documented table.

## Develop

```bash
bun test plugins/snaptrade
bunx tsc --noEmit -p plugins/snaptrade/tsconfig.json
```
