# Paddle

A Flexwall plugin that reads verified revenue from a [Paddle Billing](https://www.paddle.com) account.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `paddle` | Pro, verified. Paddle's own metrics, one request per kind of metric a tile needs. |

| Metric | Type | Endpoint | Value |
|---|---|---|---|
| `mrr` | Money, balance currency | `GET /metrics/monthly-recurring-revenue` | The latest day of Paddle's MRR timeseries. Competes on the revenue leaderboard. |
| `subscribers` | Count | `GET /metrics/active-subscribers` | The latest day of Paddle's active subscribers. |
| `revenue30d` | Money, balance currency | `GET /metrics/revenue` | Sum of the last 30 days, today included. |
| `revenue-daily` | Series, balance currency | `GET /metrics/revenue` | The same 30 days, one point per day Paddle returns. |

Hosts: `https://api.paddle.com` for live keys, `https://sandbox-api.paddle.com`
for sandbox keys, chosen from the key's prefix. Every request asks for
`from` = 29 days before today and `to` = tomorrow (`to` is exclusive, both at
00:00 UTC), so today's partial day is included.

## Credentials and permissions

A **Paddle Billing API key**: in Paddle, open **Developer tools → Authentication
→ API keys → New API key**, and grant only:

| Permission | Why |
|---|---|
| `metrics.read` | Reads MRR, active subscribers and revenue from the Metrics API. |

Nothing else: the connector never lists subscriptions, transactions, customers
or prices, and never writes. Live keys (`pdl_live_apikey_…`) read live data,
sandbox keys (`pdl_sdbx_apikey_…`) read the sandbox and the connection is
labelled "sandbox". Keys must match Paddle's documented format; client-side
tokens and keys in the old format are refused before any request. Paddle Classic
(vendor id + auth code) isn't supported.

The key is encrypted by Flexwall and only used on the server. The connection
list shows the mode, the balance currency and the last four characters of the key.

## How the numbers are defined

Paddle computes these numbers itself, so they match Paddle's own metrics rather
than a recomputation. Paddle's definitions:

- **MRR**: current monthly recurring revenue, including new subscriptions,
  upgrades, downgrades and churn. One-time payments are left out, Paddle fees
  aren't deducted. Paddle doesn't document how trials, past-due or paused
  subscriptions and discounts are treated.
- **Subscribers**: paying users with active subscriptions; trials are left out.
- **Revenue, 30 days**: net revenue from completed payments (one-time,
  subscription, invoices) **after tax and Paddle fees**, **before refunds and
  chargebacks**. Stripe's `revenue30d` is the other way round (fees not
  deducted, refunds deducted), so the two aren't strictly comparable.
- **Currency**: every amount is in the account's **primary balance currency**
  (USD, EUR, GBP, AUD or CAD). Paddle converts sales in other currencies at the
  exchange rate of each transaction for MRR, and at the current rate for revenue.
  There is no currency to pick and nothing is left out for being in another currency.
- Amounts arrive as strings in the smallest unit and are divided by 100, except
  zero-decimal currencies (CLP, JPY, KRW). Money values are rounded to whole units.

An account with no data yet gets no MRR or subscribers value and a revenue of 0.

### Why not compute MRR from subscriptions

Walking `GET /subscriptions` and pricing each item would need `subscription.read`
as well, a page walk with a cap, a rule for accounts selling in several
currencies, and guesses about regional price overrides, discounts and
tax-inclusive prices that the subscription list doesn't settle. Paddle's Metrics
API (released March 2026) answers all of it with one read-only permission and
Paddle's own currency conversion.

## Limits

Paddle allows 240 requests a minute per IP. A refresh makes at most three
requests, and values stay fresh for 30 minutes.

## Not verified against a real account

Built from Paddle's OpenAPI description and developer docs, without a live key:

- That `to` may be tomorrow's date (the documented example's `ends_at` is the day
  after its `updated_at`, which suggests today's partial day is served).
- How often Paddle refreshes the metrics (`updated_at`), and whether the sandbox
  computes them at all.
- The exact 401 body for a revoked key; 403 follows the documented `forbidden` error.
- How Paddle's MRR treats trials, past-due and paused subscriptions, and discounts.

## Develop

```bash
bun test plugins/paddle
bunx tsc --noEmit -p plugins/paddle/tsconfig.json
```

Fixtures in `tests/fixtures` are the examples from Paddle's OpenAPI description
([PaddleHQ/paddle-openapi](https://github.com/PaddleHQ/paddle-openapi)).
