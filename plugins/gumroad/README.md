# Gumroad

A Flexwall plugin that reads verified revenue and sales from a [Gumroad](https://gumroad.com) account.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `gumroad` | Pro, verified. Numbers come from Gumroad's sales summary: one request for the 30-day metrics, one for the all-time ones. |

| Metric | Type | Value |
|---|---|---|
| `revenue-total` | Money, US dollars | All-time `net_cents` of `GET /v2/sales/summary?from=2011-01-01`, in whole dollars. |
| `sales` | Count | All-time `units` of the same request. |
| `revenue30d` | Money, US dollars | `net_cents` of `GET /v2/sales/summary` (Gumroad's default window: the last 30 days, today included). |
| `sales30d` | Count | `units` of the same request. |

The token goes in an `Authorization: Bearer` header, never in the URL.

## Credentials and permissions

A **personal access token**. In Gumroad, open **Settings → Advanced → Applications**,
create an application used only by Flexwall (any icon, name it Flexwall, redirect
URI `http://127.0.0.1`, which isn't used), then click **Generate access token**.

| Scope | Why |
|---|---|
| `view_sales` | Reads the sales summary. |
| `view_profile` (or any read scope) | Reads your name and user id from `GET /v2/user` when you connect, to label the connection. |

**Gumroad has no read-only personal tokens.** A generated token carries every
scope of its application, and applications created in Settings get all of them,
including editing products and refunding sales. Flexwall only ever sends `GET`
requests, but it can't make the token itself weaker. So:

- create an application only for Flexwall, so revoking it breaks nothing else;
- delete the application (or revoke its token) if you disconnect Flexwall;
- the token doesn't expire on its own.

When you connect, Flexwall reads `/v2/user`, then the sales summary, so a token
that can't read sales fails right away. The token is encrypted by Flexwall and
only used on the server. The connection list shows your Gumroad name, profile
URL and the last four characters of the token.

## How the numbers are defined

Gumroad computes the summary itself, on its side, in one aggregation:

- **Revenue** is the price of every charged sale created in the window minus the
  amounts refunded on those sales, before Gumroad's fees, recurring membership
  charges included. Chargebacks aren't deducted. Gift receipts, bundle
  sub-purchases and commission completions aren't counted. A refund issued
  today on a sale from last month lowers all-time revenue but not the 30-day one. This is close to
  the Stripe connector's `revenue30d` (charges minus refunds, before fees).
- **Sales** is Gumroad's count of charged sales created in the window, each
  membership renewal counted as a sale, refunded and charged-back sales
  included: the same sales revenue nets refunds out of.
- **Always US dollars**, whatever currency your products are priced in: Gumroad
  stores sale amounts in USD cents. Values are rounded to whole dollars.
- **Windows** follow the timezone set in your Gumroad settings, not the
  wall owner's. "30 days" includes today. All-time starts on 2011-01-01, before
  Gumroad's first sale.

### No revenue leaderboard

Revenue leaderboards compare monthly recurring revenue (Stripe's, Paddle's,
Polar's MRR). Gumroad computes an MRR for memberships internally but doesn't
expose it in its API, and most Gumroad revenue is one-time sales, so neither
all-time nor 30-day revenue is a defensible MRR. None of these metrics enters a
leaderboard. Tiles still show them, verified.

### Why the summary and not the sales list

`GET /v2/sales` returns 10 sales a page: a month of a busy store would take
dozens of requests and miss the 4-second render budget. `GET /v2/products`
carries `sales_usd_cents`, but also 10 per page, and it skips deleted products,
so their sales would vanish from all-time revenue. The summary answers each
window in one request.

## Limits

Gumroad publishes no rate limit, so values stay fresh for an hour. A refresh
makes at most two requests. Gumroad stops a summary query after 15 seconds on
very large accounts; the tile then keeps its last value.

## Not verified against a real account

- **`GET /v2/sales/summary` isn't in Gumroad's public API reference.** It's
  implemented in Gumroad's open-source server (`Api::V2::SalesSummary`, route
  `v2/sales/summary`, scope `view_sales`), listed in the catalog of Gumroad's
  own store agent, and answers `401` rather than `404` on `api.gumroad.com`
  without a token, but Gumroad could change it without notice. Fixture
  `sales-summary.json` follows that implementation, not a recorded response.
- That the Bearer header works with a generated token. Gumroad's docs show the
  token as an `access_token` parameter; the server (Doorkeeper) answers a bad
  Bearer header with `invalid_token`, which shows it reads the header.
- The status Gumroad returns for a token missing `view_sales` (403 expected).
- That all-time totals with `from=2011-01-01` finish within Gumroad's query timeout for large accounts.

## Develop

```bash
bun test plugins/gumroad
bunx tsc --noEmit -p plugins/gumroad/tsconfig.json
```
