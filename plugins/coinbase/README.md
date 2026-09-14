# Coinbase

A Flexwall plugin that reads a verified portfolio value from a Coinbase
account, through the Advanced Trade API.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `coinbase` | Pro, verified. Metrics below, answered by one pass over the portfolios. |

| Metric | Type | Where it comes from |
|---|---|---|
| `portfolio-value` | Money, US dollars. Sensitive: public walls show a range like "$100k+". Competes on the wealth leaderboard. | Sum of `breakdown.portfolio_balances.total_balance` over portfolios |
| `assets` | Count | Distinct `spot_positions[].asset` with a positive balance |

Requests per refresh: `GET /api/v3/brokerage/portfolios`, then
`GET /api/v3/brokerage/portfolios/{uuid}?currency=USD` for each portfolio that
isn't deleted, 20 at most, in parallel.

## Credentials and permissions

A **CDP secret API key** from the Coinbase Developer Platform: **API Keys →
Secret API Keys → Create API key**.

- **Permissions:** **View** only. Connecting calls
  `GET /api/v3/brokerage/key_permissions` and **refuses** keys with Trade or
  Transfer, or without View.
- **Signature algorithm: ECDSA.** Coinbase documents that Ed25519 keys don't
  work with its trading API. An Ed25519 key, as a PEM or as the bare base64
  secret CDP shows, is refused before any request. (Bun's WebCrypto can sign
  Ed25519; the limit is Coinbase's.)
- Paste the **key name** (`organizations/…/apiKeys/…`) and the **private key**
  (`-----BEGIN EC PRIVATE KEY-----…`). The key can be pasted with real
  newlines, with `\n` escapes as in the downloaded JSON, or with no newlines at
  all. PKCS#8 (`BEGIN PRIVATE KEY`) P-256 keys work too.

Both the key name and the private key are encrypted by Flexwall. The
connection list shows the key's portfolio name and the last four characters of
the key name. The connection id is the key's `portfolio_uuid`.

## How the value is computed

- **Valuation:** Coinbase's `total_balance` for each portfolio, asked in USD
  (`currency=USD`). Stablecoins and cash are valued by Coinbase, so USDC counts
  at whatever dollar value Coinbase gives it. If Coinbase answers in another
  currency, the refresh fails rather than mixing currencies.
- **Counted:** every live portfolio the key can read, with whatever Coinbase
  includes in a portfolio's total: spot crypto, cash, and the futures,
  perpetuals and equities balances reported in `portfolio_balances`.
- **Not counted:** deleted portfolios, portfolios past the 20th (logged),
  portfolios the key can't read (a 403 or 404 on one breakdown skips it), and
  anything outside Advanced Trade portfolios (Coinbase Wallet, Coinbase Prime).
- The value is rounded to the dollar.

`assets` counts distinct assets with a positive fiat or crypto balance across
the spot positions of those portfolios, cash included.

## Signing

Every request carries a new JWT: header `alg: ES256`, `kid` (the key name),
random `nonce`, `typ: JWT`; claims `sub` (the key name), `iss: "cdp"`, `nbf`,
`exp` two minutes later, and `uri` as `GET api.coinbase.com/<path>` without the
query string. Signing uses WebCrypto. Coinbase gives SEC1 keys, which WebCrypto
can't import, so `sec1ToPkcs8` rewraps them into PKCS#8; the test checks the
result is byte for byte what `openssl pkcs8 -topk8` produces. Coinbase
publishes no example JWT, so signatures are tested by verifying them with the
public key of a generated test key pair.

## Limits

Coinbase doesn't publish rate limits for these endpoints on the pages this
connector was built from. Without a published limit Flexwall's rule is an hour
of freshness, unless the number changes faster; a crypto portfolio's value
moves with prices all day, so values stay fresh 15 minutes. A refresh costs one
request plus one per portfolio (21 at most). 429 and 5xx pass through, so the
tile keeps its last value.

## Errors

- 401: the key was deleted, or the private key doesn't match the key name.
- 403: the key lacks View, or its IP allowlist doesn't include Flexwall's server.

## Not verified against a real account

- Coinbase's reference has schemas but no example responses: fixtures follow
  the schemas, not recorded answers.
- Whether a key restricted to one portfolio can list the others, and what a
  breakdown of those answers (a 403 is assumed and skipped).
- Whether `total_balance` includes staked assets and the futures, perpetuals
  and equities balances, and whether `currency=USD` is honoured for accounts
  in other countries.
- Coinbase's rate limits for these endpoints, which aren't published on the
  pages this connector was built from.
- Whether key names that are a bare id (without `organizations/…/apiKeys/`)
  are accepted as `kid`.
- The shape of Coinbase's 401 and 403 bodies.

## Develop

```bash
bun test plugins/coinbase
bunx tsc --noEmit -p plugins/coinbase/tsconfig.json
```

The tests generate their P-256 and Ed25519 keys when they start, and lay the
P-256 one out the way openssl writes SEC1 and PKCS#8, so the repository holds
no private key.
