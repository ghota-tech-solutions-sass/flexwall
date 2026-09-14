# RevenueCat

A Flexwall plugin that reads verified subscription numbers from a
[RevenueCat](https://www.revenuecat.com) project.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `revenuecat` | Pro, verified. Every metric comes from one request to the project's overview metrics. |

| Metric | Type | Where it comes from |
|---|---|---|
| `mrr` | Money, project currency | RevenueCat's overview metric `mrr`. Competes on the revenue leaderboard. |
| `revenue28d` | Money, project currency | Overview metric `revenue`: gross revenue of the last 28 days. |
| `active-subscriptions` | Count | Overview metric `active_subscriptions`. |
| `active-trials` | Count | Overview metric `active_trials`. |
| `new-customers-28d` | Count | Overview metric `new_customers`. |
| `active-users-28d` | Count | Overview metric `active_users`. |

Endpoint: `GET https://api.revenuecat.com/v2/projects/{project_id}/metrics/overview`.

## Credentials and permissions

A **V2 secret API key** and the **project id**. In RevenueCat, open
**Project settings → API keys → + New secret API key**, choose version **V2**,
and set only this permission:

| Permission | Why |
|---|---|
| Charts & metrics: Read only (`charts_metrics:overview:read`) | Reads the overview metrics. |

Everything else stays at **No access**. The connector doesn't list projects
(that would need `project_configuration:projects:read`, a second permission):
the overview request itself proves the key, its permission and the project id
when you connect. Public SDK keys (`appl_`, `goog_`…) are refused before any
request; V1 secret keys also start with `sk_` but RevenueCat refuses them on
API v2, and the error says so.

The key is encrypted by Flexwall and only used on the server. The connection
list shows the project id, the currency and the last four characters of the key.

## How the numbers are defined

Flexwall shows RevenueCat's own numbers rather than recomputing them, so they
match your RevenueCat dashboard's Overview. RevenueCat's definitions:

- **MRR**: every paid, unexpired subscription normalized to a month (yearly
  divided by 12, weekly times 4), including subscriptions whose auto-renew is
  off. Non-recurring purchases are left out. Like Polar, a subscription counts
  until it expires; the Stripe connector counts only `active`, unpaused ones.
- **Revenue, 28 days**: gross revenue tracked in the last 28 days, **before store
  fees and taxes**. It isn't comparable to
  Stripe's 30-day revenue (net of refunds) or Paddle's (net of fees and tax).
- **Active subscriptions** and **active trials**: currently active paid
  subscriptions and free trials, including cancelled ones and grace periods
  until they end.
- **New customers**: app user ids created in the last 28 days (aliases count once).
  **Active users**: app user ids seen in the last 28 days. RevenueCat may cache
  these two for 1 to 2 hours.
- **Currency**: RevenueCat converts every store currency into one; the
  connector uses the `currency` field of the response (USD by default) and
  ignores each metric's `unit`, which RevenueCat always sets to `$`. Values are
  rounded to whole units.

A metric RevenueCat doesn't return shows no value rather than 0.

## Limits

The Charts & Metrics API allows 25 requests a minute per project. The connector
makes one request per refresh and values stay fresh for 30 minutes.

## Not verified against a real account

Built from RevenueCat's API v2 OpenAPI description and documentation, without a
live key:

- The ids of the six overview metrics. The schema documents the object's
  fields but its example only shows `active_trials`; `mrr` is confirmed by
  RevenueCat staff, the others follow the dashboard cards. An id RevenueCat
  doesn't send just leaves that tile empty.
- That monetary `value`s are major units (dollars, not cents). Assumed from the
  sibling revenue endpoint, which documents two-decimal major units.
- Which status RevenueCat returns for a valid key used with another project's
  id (403 or 404): both give an actionable message.

## Develop

```bash
bun test plugins/revenuecat
bunx tsc --noEmit -p plugins/revenuecat/tsconfig.json
```

`tests/fixtures/overview.json` follows the `OverviewMetrics` schema of
RevenueCat's API v2 reference.
