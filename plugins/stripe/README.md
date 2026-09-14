# Stripe

Verified MRR, revenue and customers from the owner's Stripe account. Pro.

## Credentials

A **restricted key** (`rk_live_…`) with **Read** access to Subscriptions,
Balance and Coupons, nothing else. Full secret keys (`sk_…`) are refused. A key
without Coupons access still works: MRR ignores discounts.

## Metrics

| Metric | How |
|---|---|
| `mrr` | Active subscriptions in the account currency, licensed prices normalized to a month, running subscription-level coupons applied |
| `subscribers` | Count of active subscriptions |
| `revenue30d`, `revenue-daily` | Balance transactions of the last 30 days: charges and payments minus refunds |

Left out of MRR: trials, past-due and paused subscriptions, metered and tiered
prices, other currencies (not converted), item-level discounts. One refresh
walks at most 20,000 subscriptions; past that the numbers are floors. Values
stay fresh for 30 minutes.
