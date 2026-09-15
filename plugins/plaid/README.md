# Plaid

A Flexwall plugin that reads verified balances of an owner's bank, card, loan
and investment accounts in the **United States and Canada**, through
[Plaid](https://plaid.com) Hosted Link.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `plaid` | Pro, verified. The owner signs in on Plaid's page; Flexwall reads balances only. |

| Metric | Type | What |
|---|---|---|
| `cash` | Money, sensitive | Sum of `balances.current` of `depository` accounts (checking, savings, CDs, money market, cash management). When `current` is null, `available` (Plaid guarantees one of the two). |
| `investments` | Money, sensitive | Sum of `balances.current` of `investment` accounts (and `brokerage`, the pre-2018 name), which Plaid defines as "the total value of assets as presented by the institution". When `current` is null, the account's holdings (`institution_value`) instead: `available` isn't used here, because for investment accounts it's only "the total cash available to withdraw". |
| `net-worth` | Money, sensitive, wealth leaderboard | `cash` + `investments` − `balances.current` of `credit` accounts − `balances.current` of `loan` accounts. |

All three come from **one** `/accounts/get` call (one `cacheKey`). Sensitive:
public walls print ranges like "$100k+".

**What net worth subtracts, exactly.** For `credit` accounts Plaid's `current`
is the amount owed ("a positive balance indicates the amount owed; a negative
amount indicates the lender owing the account holder"), so a card in credit
adds. For `loan` accounts `current` is "the principal remaining" (Sallie Mae
student loans include outstanding interest). Mortgages, student, auto and other
loans are all subtracted when the owner shares them. `other` accounts count
nowhere. Only accounts at this one institution count: it's the net worth of
what this connection shares, not of the owner's whole life. The wealth
leaderboard compares amounts without converting currencies.

**Currency.** Plaid returns one ISO code per account. The totals use the most
common `iso_currency_code` among depository, investment, credit and loan
accounts; a tie goes to the first code alphabetically (CAD before USD), so the
pick doesn't depend on order. Accounts in another currency, and accounts with
only an `unofficial_currency_code` (crypto), are left out and counted in a log
line. Nothing is converted. With no priced account at all, totals are 0 in USD
(CAD for a Canadian connection). Amounts are rounded to the cent.

## How connecting works

The owner picks a **country** (US or CA) and is sent to Plaid.

1. `authorize`: `POST /link/token/create`
   ```json
   {
     "client_name": "Flexwall",
     "language": "en",
     "country_codes": ["US"],
     "user": { "client_user_id": "<random UUID per sign-in>" },
     "products": ["transactions"],
     "optional_products": ["investments"],
     "hosted_link": { "completion_redirect_uri": "https://flexwall.lol/api/connections/oauth/callback?state=<state>" }
   }
   ```
   The answer's `hosted_link_url` (secure.plaid.com) is where the owner goes;
   the `link_token` is sealed in `carry`, never in a URL. No Flexwall user id
   reaches Plaid. No top-level `redirect_uri` is sent: Plaid documents it for
   OAuth app-to-app flows in native mobile apps, and lists Hosted Link as
   needing no Link reinitialization after an OAuth bank; in a browser, Plaid
   runs the bank's OAuth round trip on its own page.
2. The owner picks their institution, signs in (at the bank for OAuth banks),
   and chooses accounts. Plaid then opens `completion_redirect_uri`, **whether
   they finished or exited**. Plaid documents no parameter of its own on that
   redirect, so the host's `state` rides in its query string.
3. `complete`: `POST /link/token/get { link_token }` lists the sessions of that
   token (kept six hours after they end). The latest session with
   `results.item_add_results[].public_token` (else the deprecated
   `on_success.public_token`) is exchanged with
   `POST /item/public_token/exchange { public_token }` for a permanent
   `access_token`.
   - `secret`: `{ accessToken }`.
   - `public`: `{ institution, country, accounts }`, institution name taken from
     the session's `institution.name` (no `/item/get` or
     `/institutions/get_by_id` call needed).
   - `label`: the institution name.
   - `accountId`: SHA-256 of `institution_id` and the sorted
     `type/subtype/mask` of shared accounts. Plaid's `item_id` is new on every
     link ("linking the same account at the same institution twice will result
     in two Items"), so it can't recognise a reconnect; this hash can. Falls
     back to `item_id` when the session has no institution id or accounts.
     With Account Select, the session lists only the accounts the owner chose:
     reconnecting with a different set makes a second connection, and the old
     Item keeps billing at Plaid (see Reconnecting).
   - No `expiresAt`, no `refresh`: US and Canadian access tokens don't expire
     (`consent_expiration_time` concerns UK/EU OAuth).

A session with no public token (the owner exited), no session, a lost or
expired link token (`INVALID_LINK_TOKEN`) all end with "The bank connection
didn't finish." and nothing is exchanged. A used or expired public token
(`INVALID_PUBLIC_TOKEN`, 30-minute lifetime) is its own sentence.

## Why these products, and why `/accounts/get`

- `products` can't be empty and `balance` isn't a valid value.
- `/accounts/get` is **free** and cached. Plaid: "If the Item is enabled for a
  regularly updating product, such as Transactions, Investments, or
  Liabilities, the balance will typically update about once a day … If the Item
  is enabled only for products that do not frequently update, such as Auth or
  Identity, balance data may be much older" (the Balance guide says every 30
  days or less for Auth only).
- `/accounts/balance/get` is real-time but **billed per call** (the Balance
  flat fee) and slow (Plaid: p50 ~3 s, p95 ~11 s), past the 4-second render
  budget. At a 6-hour `ttl` it would be about 120 billed calls a month per
  connection. Not used.
- So the Item needs a daily-updating product: **Transactions** is required.
  Flexwall never calls a transactions endpoint.
- **Investments** is in `optional_products`: banks without it still show, and
  Plaid adds it where supported. It's there rather than in
  `additional_consented_products` because Plaid's `PRODUCTS_NOT_SUPPORTED` doc
  says product endpoints fail when the product wasn't in `products` or
  `optional_products`.
- `/investments/holdings/get` is only called when `investments` or
  `net-worth` is asked **and** an investment account in the chosen currency has
  no `current` balance. Its holdings' `institution_value` in that currency are
  summed for those accounts. `PRODUCTS_NOT_SUPPORTED`, `PRODUCT_NOT_ENABLED` or
  `NO_INVESTMENT_ACCOUNTS` count them as 0 (logged).

**Limitation of this choice**: with Transactions required, Link only lets
owners pick institutions that support Transactions and an Item that holds at
least one Transactions-compatible account (depository, credit, student or
mortgage loan, other; Plaid's matrix gives Transactions no investment
accounts). A **brokerage-only** institution, or a login sharing only investment
accounts, probably can't be connected.

## Errors

Plaid answers almost every error with HTTP 400 and asks clients to branch on
`error_code`:

| Code | Result |
|---|---|
| `ITEM_LOGIN_REQUIRED` | "Reconnect <institution> in Plaid: the bank wants you to sign in again." |
| `ACCESS_NOT_GRANTED`, `NO_ACCOUNTS` | "Reconnect <institution> in Plaid: it no longer shares these accounts." |
| `ITEM_NOT_FOUND`, `INVALID_ACCESS_TOKEN` | "Reconnect <institution> in Plaid: this connection was removed or belongs to another Plaid environment." |
| `INVALID_API_KEYS` | "Plaid refused this Flexwall server's keys." |
| `UNAUTHORIZED_ENVIRONMENT` | "This Flexwall server's Plaid app isn't allowed in this Plaid environment." |
| `INVALID_LINK_TOKEN` (complete) | "The bank connection didn't finish." |
| `INVALID_PUBLIC_TOKEN` (complete) | "That Plaid sign-in expired or was already used. Connect again." |
| `PRODUCTS_NOT_SUPPORTED`, `PRODUCT_NOT_ENABLED`, `NO_INVESTMENT_ACCOUNTS` (holdings) | Those accounts count as 0 |
| Rate limits (429 `ACCOUNTS_LIMIT`, `INVESTMENT_HOLDINGS_GET_LIMIT`), `PRODUCT_NOT_READY`, institution and API errors, anything else | Passed through: tiles keep their last value |

**Reconnecting.** Plaid's fix for `ITEM_LOGIN_REQUIRED` is Link **update
mode**, and its early warning is the `PENDING_DISCONNECT` webhook (US/CA;
`PENDING_EXPIRATION` is the UK/EU one, and both are webhooks, not error codes).
The Flexwall host has neither update mode nor a webhook receiver, so the owner
connects again, which makes a new Item (and replaces the old connection when
they share the same accounts, see `accountId`). The old Item isn't removed at
Plaid (`/item/remove`): its subscriptions keep billing until an operator
removes it.

## Limits

- `ttl` is **6 hours**. Cached balances move about once a day, and
  `/accounts/get` is limited to 15 requests a minute per Item in Production.
- Missing `PLAID_CLIENT_ID` or `PLAID_SECRET`: "This Flexwall server has no
  Plaid app." before any request. A `PLAID_ENV` other than `sandbox` or
  `production` is refused the same way.
- The host keeps a pending sign-in for 30 minutes, as long as a Hosted Link URL
  lives by default. An owner who takes longer gets the host's "This sign-in
  expired" and starts again.
- Requests allow 15 s; the first render of a new tile still needs an answer
  under 4 s.

## Operator setup

1. Create a team at <https://dashboard.plaid.com> and take the **client_id**
   and the **Sandbox** secret (Developers → Keys). Sandbox is free and has
   every product and country.
2. **Production access**: request it in the Dashboard. New US/Canada teams
   created since April 15, 2026 get a free Trial plan with 10 Production Items;
   then Pay as you go, Growth or Custom. Make sure **Transactions** and
   **Investments** and the **US** and **CA** countries are enabled for
   Production: in Production only the countries you requested are shown, and
   more are requested with a product access Support ticket in the Dashboard.
   OAuth banks (Chase, Wells Fargo, …) additionally need Plaid to enable OAuth
   for your team (Plaid's OAuth guide; Sandbox OAuth works without it).
3. **Hosted Link** needs no enablement any more: sending the `hosted_link`
   object is enough.
4. **Completion redirect**: add
   `https://flexwall.lol/api/connections/oauth/callback` (or your own origin
   when self-hosting) to the Dashboard's **allowed completion redirect URIs**
   (Developers → API). The top-level OAuth "Allowed redirect URIs" list isn't
   used, because no `redirect_uri` is sent.
5. No webhook is configured.
6. Server environment:
   - `PLAID_CLIENT_ID`
   - `PLAID_SECRET`: the secret **of the environment** in `PLAID_ENV`.
   - `PLAID_ENV`: `sandbox` (default, `https://sandbox.plaid.com`) or
     `production` (`https://production.plaid.com`).

   Keys are sent in the `PLAID-CLIENT-ID` and `PLAID-SECRET` headers, never in
   a URL or a log. **To wire in the app** (outside this folder): add the three
   names to `CONNECTOR_ENV` in `apps/web/src/composition.ts`, to the
   `connector_secrets` validation in `terraform/variables.tf`, and to
   `docs/self-hosting.md`.

### Sandbox test

With `PLAID_ENV=sandbox`, connect, pick a non-OAuth test bank such as First
Platypus Bank (`ins_109508`), and sign in with **`user_good` / `pass_good`**
(special credentials may be ignored on Sandbox OAuth banks such as Platypus
OAuth Bank `ins_127287`, which show a sample consent page instead).

### Pricing

Plaid publishes no prices; they're in the Dashboard or from sales. The billing
models are documented:

| What Flexwall uses | Plaid billing model |
|---|---|
| Transactions (required on every Item) | Subscription, monthly per Item while it has a valid access token |
| Investments (optional, where supported) | Subscription, monthly per Item |
| `/accounts/get`, `/link/token/*`, `/item/public_token/exchange` | Free (not tied to a product) |
| `/investments/holdings/get` | Covered by the Investments subscription |
| `/accounts/balance/get` | Per-call flat fee: **not used** |

So a connection costs about one or two subscriptions a month, whatever the
`ttl`. Subscriptions end only with `/item/remove`, which Flexwall doesn't call
when an owner deletes a connection.

## Not verified against a real account

- Fixtures are the examples of Plaid's API reference and Hosted Link guide
  (plaid-openapi `2020-09-14`), trimmed; no response was recorded. No
  `Plaid-Version` header is sent, so the Dashboard's API version shapes answers.
- **Whether Plaid keeps the `?state=` query string** when it opens
  `completion_redirect_uri`, and whether the Dashboard's allowed completion
  redirect list accepts an entry matching an address with a query string. If
  either fails, sign-ins end with the host's "didn't come back from where it
  started".
- Whether web Hosted Link needs the address registered in that list at all
  (the guide says so for mobile custom schemes).
- That `/link/token/get` already lists the finished session when the owner
  lands on the callback, with no delay after the redirect.
- That brokerage-only institutions can't be linked with Transactions required,
  and whether investment account balances refresh daily on Items where
  Investments wasn't added.
- That Investments in `optional_products` is billed only where supported.
- How often `current` is null on investment accounts, which triggers the
  holdings fallback.
- Pricing amounts, and the exact Dashboard menu names for completion redirect
  URIs and OAuth registration.

## Develop

```bash
bun test plugins/plaid
bunx tsc --noEmit -p plugins/plaid/tsconfig.json
```
