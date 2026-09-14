# Lemon Squeezy

A Flexwall plugin that reads verified revenue from a Lemon Squeezy store.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `lemon-squeezy` | Pro, verified. Metrics below, all answered by one pass over the store. |

| Metric | Type | Where it comes from |
|---|---|---|
| `mrr` | Money, store currency | Computed from active subscriptions and their prices. Competes on the revenue leaderboard. |
| `active-subscriptions` | Count | Lemon Squeezy's own total of subscriptions with status `active`. |
| `revenue-30d` | Money, US dollars | The store's `thirty_day_revenue`, as Lemon Squeezy reports it. |

## Credentials and permissions

An API key, from **Settings → API** in Lemon Squeezy.

**Lemon Squeezy has no read-only or restricted keys.** Every key can do
everything your account can, including changing products and cancelling
subscriptions. Flexwall only ever sends `GET` requests, but it can't make the
key itself any weaker. So:

- create a key used only by Flexwall, so you can revoke it without breaking anything else;
- revoke it in Settings → API if you disconnect Flexwall;
- keys expire after a year: connect again with a new one when yours does.

A test mode key works too and reads test mode data; the connection is labelled
"(test)". If the account has several stores, type the slug or name of the one
to show; connect again for each store.

The key is encrypted by Flexwall and only used on the server. The connection
list shows the store name and the last four characters of the key.

Requests made per refresh (every 30 minutes at most): the store, the active
subscriptions (100 per page, 50 pages at most) and each distinct price they use
(100 at most). Lemon Squeezy allows 300 requests a minute.

## How MRR is computed

Lemon Squeezy has no MRR endpoint, so MRR is computed, deliberately simply:

- **Active subscriptions only.** Trials, past due, unpaid, paused, cancelled
  (even while still in their grace period) and expired subscriptions don't count.
- **Normalized to a month.** Yearly prices are divided by 12, weekly ones
  multiplied by 52/12, daily ones by 365/12, and every 3 months divided by 3.
- **The first subscription item only**, at the price it points to (not the
  variant's current price, so grandfathered prices are respected) times its quantity.
- **Standard and package prices only.** Usage-based, graduated and volume
  prices are left out.
- **Discounts are ignored**: the subscription object doesn't say which apply.
- **The store's currency**, in cents, as the price object documents. Nothing is
  converted. Lemon Squeezy's docs don't say whether zero-decimal currencies such
  as JPY are also divided by 100; this connector assumes they are.
- Past 5,000 active subscriptions or 100 distinct prices, MRR is a floor.

`revenue-30d` is Lemon Squeezy's own number and is in US dollars whatever the
store's currency, so it can be in a different currency from `mrr`.

## Develop

```bash
bun test plugins/lemon-squeezy
bunx tsc --noEmit -p plugins/lemon-squeezy/tsconfig.json
```

Fixtures in `tests/fixtures` are the example responses from Lemon Squeezy's API
reference. To show the plugin in the app, register it in
`apps/web/src/plugins/registry.ts` and the app's dependencies.
