# Trading 212

A Flexwall plugin that reads verified numbers from a real-money
[Trading 212](https://www.trading212.com) Invest or Stocks ISA account, through
Trading 212's public API (beta).

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `trading212` | Pro, verified. Real-money accounts only. |

Every metric comes from one request, `GET https://live.trading212.com/api/v0/equity/account/summary`.

| Metric | Type | Field |
|---|---|---|
| `portfolio-value` | Money, account currency, sensitive | `totalValue`. Competes on the wealth leaderboard. |
| `cash` | Money, account currency, sensitive | `cash.availableToTrade` |
| `result` | Money, account currency, sensitive | `investments.unrealizedProfitLoss` |
| `return` | Percent (`13.16` is +13.16%) | `investments.unrealizedProfitLoss / investments.totalCost × 100`; no value when `totalCost` is 0 |

Sensitive metrics show as ranges ("£10k+") on public surfaces unless the owner
asks a tile for the exact number.

### What the numbers include

- **Portfolio value** is Trading 212's `totalValue`, passed through unchanged.
  The endpoint is documented as returning "total account value", but the
  field itself is described as "Investments value in your account's primary
  currency". Flexwall doesn't add cash to it on its own; see "Not verified".
- **Free cash** is cash available to invest. It leaves out cash sitting in
  pies (`cash.inPies`) and cash reserved for pending orders
  (`cash.reservedForOrders`).
- **Result** is the unrealised profit or loss on positions held now. Realised
  profit from past sales (`investments.realizedProfitLoss`) and dividends are
  left out.
- **Return** is that result against the cost basis of positions held now. It
  isn't a time-weighted or all-time return.
- Amounts are in the account's primary currency: Trading 212's API doesn't
  support multi-currency accounts, and documents its values as being in the
  primary currency. They are rounded to cents.

## Credentials and permissions

An **API key** and its **API secret**, both stored as secrets. In the Trading
212 app, switch to the real-money Invest or Stocks ISA account, then Settings →
API (Beta) → Generate API key:

- Tick only **Account data** (the `account` scope). The connector sends a single
  `GET` to the account summary and needs nothing else. Without it Trading 212
  answers `403 Scope( account ) missing for API key` and Flexwall says which
  permission to grant.
- Leave **IP restriction** off: Flexwall's servers don't have an address you
  could pin.
- Copy the secret right away; Trading 212 shows it once.

The API authenticates with HTTP Basic auth (key as user, secret as password).
Older single keys sent alone in the `Authorization` header aren't supported:
generate a new key pair. A key can't contain a colon, since Basic auth splits
there.

A key with more scopes than `account` still works; the connector can't detect
extra scopes (such as `orders:execute`) without using them, so it doesn't try.
Only grant what's listed above.

The connection list shows the last four characters of the key and of the
account number.

### Why Practice accounts aren't supported

Practice (demo) accounts hold simulated money, and the wealth leaderboard
can't exclude one connection from ranking. The connector only talks to
`live.trading212.com`; a Practice key is refused there.

## Limits

The account summary allows **1 request every 5 seconds per account**, counted
across every key of the account and every IP address. Values stay fresh for 15
minutes, so Flexwall uses a tiny share of that and leaves room for the owner's
own scripts. A 429 (or a 408 timeout) is passed through and tiles keep their
last value.

## Errors

- 403 with a scope message: "The API key is missing a permission…".
- 401 or another 403: "Trading 212 refused this key and secret…", covering a
  revoked key, an IP restriction and a Practice key.
- 408, 429, 5xx: passed through.

## Not verified against a real account

Built from Trading 212's OpenAPI description, which has no example response,
without a live key pair:

- whether `totalValue` includes free cash and cash in pies (the endpoint says
  "total account value", the field says "investments value");
- that a Practice key and an IP-restricted key are answered with 401 on the
  live host rather than another status;
- the exact body of a 403 for a missing scope (only its description is
  documented; the connector matches the word "scope" and falls back to the
  generic sentence);
- how the app labels the `account` scope (the help text assumes "Account data").

## Develop

```bash
bun test plugins/trading212
bunx tsc --noEmit -p plugins/trading212/tsconfig.json
```
