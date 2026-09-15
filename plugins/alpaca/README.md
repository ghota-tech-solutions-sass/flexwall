# Alpaca

A Flexwall plugin that reads verified numbers from a live
[Alpaca](https://alpaca.markets) brokerage account, through the Trading API.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `alpaca` | Pro, verified. Live accounts only. |

| Metric | Type | Where it comes from |
|---|---|---|
| `equity` | Money, account currency, sensitive | `equity` from `GET /v2/account`. Competes on the wealth leaderboard. |
| `cash` | Money, account currency, sensitive | `cash` from `GET /v2/account`. |
| `day-change` | Percent (`1.09` is +1.09%) | `(equity − last_equity) / last_equity × 100`, from `GET /v2/account`. No value when `last_equity` is 0 (a new account). |
| `equity-history` | Series, account currency, sensitive | `equity` from `GET /v2/account/portfolio/history?period=1M&timeframe=1D`, one point a day, oldest first. |

Sensitive metrics show as ranges ("$100k+") on public surfaces unless the owner
asks a tile for the exact number.

### What the numbers include

- **Equity** is Alpaca's own figure, documented as `cash + long_market_value +
  short_market_value` (short market value is negative). Alpaca documents the
  deprecated `portfolio_value` as equivalent.
- **Cash** is Alpaca's cash balance, which goes negative when the account
  borrows on margin (Alpaca's own example shows `"-23140.2"`). It is not
  buying power.
- **Change today** compares equity now with `last_equity`, equity as of the
  previous trading day at 16:00 ET. Deposits and withdrawals made today move it
  too: it isn't a performance figure.
- **History** drops days Alpaca reports as `null` rather than drawing them as
  zero. Dates are the UTC date of each timestamp.

All amounts come in the account currency (`currency`, USD for Alpaca's
brokerage accounts) and are rounded to cents.

## Credentials and permissions

A **Key ID** and **Secret Key** from the live dashboard: Home → API Keys →
Generate New Keys. Both are stored as secrets; the connection list shows the
last four characters of the Key ID and of the account number.

Alpaca keys have no scopes. Any key pair can place and cancel orders, which
this connector never does; it only sends `GET` requests. A Trading API key
can't deposit or withdraw money: bank transfers need the dashboard. Generate a
pair used only by Flexwall, so you can regenerate it without breaking anything
else.

### Why paper accounts aren't supported

Paper accounts hold simulated money, and the wealth leaderboard can't exclude
one connection from ranking. What keeps them out is the host: the connector
only talks to `https://api.alpaca.markets`, and paper keys only work on
`paper-api.alpaca.markets`. On top of that, an account whose number starts
with `PA` is refused; that prefix comes from Alpaca's examples and is a guess,
a second belt rather than the mechanism.

## Requests and limits

One refresh makes one `GET /v2/account`, plus `GET /v2/account/portfolio/history`
only when a tile shows the history. Values stay fresh for 15 minutes: equity
moves while markets are open, and that pace stays far below any limit a
single account would hit. Alpaca's reference doesn't publish a limit for these
two endpoints; a 429 is passed through and the host keeps the last value.

## Errors

- 401 or 403: "Alpaca refused these keys…", which also covers paper keys.
- A paper account number: refused when connecting.
- 429, 5xx: passed through; tiles keep their last value, marked stale.

## Not verified against a real account

Built from Alpaca's API reference and its example responses, without live keys:

- that a paper key is answered with 401 (and not 403) by the live host;
- that live account numbers never start with `PA` (paper ones do in Alpaca's examples);
- the exact time of day of daily history timestamps; the UTC date is assumed to be the trading day;
- whether `last_equity` is `"0"` or missing for a brand-new account;
- whether crypto positions are part of `long_market_value`, and so of equity.

## Develop

```bash
bun test plugins/alpaca
bunx tsc --noEmit -p plugins/alpaca/tsconfig.json
```

Fixtures in `tests/fixtures` are Alpaca's documented examples with dates moved
to 2026.
