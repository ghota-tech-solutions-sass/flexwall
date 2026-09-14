# Polar

A Flexwall plugin that reads verified revenue from a [Polar](https://polar.sh) organization.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `polar` | Pro, verified. Both metrics come from one request to Polar's metrics endpoint. |

| Metric | Type | Where it comes from |
|---|---|---|
| `mrr` | Money, US dollars | Polar's `monthly_recurring_revenue`. Competes on the revenue leaderboard. |
| `active-subscriptions` | Count | Polar's `active_subscriptions`. |

## Credentials and permissions

An **Organization Access Token**: in Polar, open your organization's
**Settings → Developers → New token**, and select only these scopes:

| Scope | Why |
|---|---|
| `metrics:read` | Reads MRR and active subscriptions from `GET /v1/metrics/`. |
| `organizations:read` | Reads the organization's name and id when you connect, to label the connection. |

Nothing else is needed: the connector never lists customers, orders or
subscriptions, and never writes. Personal access tokens (`polar_pat_`) are
refused. Give the token an expiration date if you like; connect again when it
expires. Sandbox tokens don't work: the connector reads production data only.

The token is encrypted by Flexwall and only used on the server. The connection
list shows the organization's name and the last four characters of the token.

## How MRR is defined

Flexwall shows Polar's own numbers rather than recomputing them, so they match
your Polar dashboard. Polar's definitions:

- **MRR** is the sum of every ongoing subscription's net amount, normalized to
  a month (yearly plans divided by 12). Trials are excluded. Paused, past due
  and cancelled subscriptions that haven't reached the end of their period
  still count, until they actually end. This is broader than the Stripe and
  Lemon Squeezy connectors, which count active subscriptions only.
- **Currency**: Polar converts other currencies to US dollars, so MRR is always in USD.
- **Active subscriptions** counts subscriptions until they actually end, with the same rule.

The connector asks for today's values (the owner's date, one day, interval `day`)
and pins the API with `Polar-Version: 2026-04`, Polar's current version. That
version is removed in January 2027: move to `2026-10` before then.

## Develop

```bash
bun test plugins/polar
bunx tsc --noEmit -p plugins/polar/tsconfig.json
```

Fixtures in `tests/fixtures` follow the response schemas in Polar's API
reference. To show the plugin in the app, register it in
`apps/web/src/plugins/registry.ts` and the app's dependencies.
