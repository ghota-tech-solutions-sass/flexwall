# Binance

A Flexwall plugin that reads a verified portfolio value from a Binance account.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `binance` | Pro, verified. Metrics below, answered by one wallet call. |

| Metric | Type | Where it comes from |
|---|---|---|
| `portfolio-value` | Money, US dollars. Sensitive: public walls show a range like "$1M+". Competes on the wealth leaderboard. | `GET /sapi/v1/asset/wallet/balance` × `GET /api/v3/ticker/price?symbol=BTCUSDT` |
| `assets` | Count | The same wallet call with `needBalanceDetail=true` |

## Credentials and permissions

A **system-generated (HMAC)** API key and its secret key, from **Account → API
Management → Create API**. Ed25519 and RSA keys aren't supported.

Leave **Enable Reading** on and everything else off. Connecting calls
`GET /sapi/v1/account/apiRestrictions` and **refuses** keys with any of:
Enable Spot & Margin Trading, Enable Margin Loan, Repay & Transfer, Enable
Futures, Enable European Options, Enable Portfolio Margin Trading, FIX API
trading, Enable Withdrawals, Enable Internal Transfer, Permits Universal
Transfer. The error names each one to turn off.

An IP restriction is optional. If the key has one, it must allow the server
Flexwall runs on, or Binance refuses the key (`-2015`).

Connecting also reads `GET /api/v3/account?omitZeroBalances=true` once, for the
account's `uid`, so reconnecting the same account replaces the connection. The
key and secret are encrypted by Flexwall; the connection list shows the last
four characters of the API key.

## How the value is computed

`/sapi/v1/asset/wallet/balance` lists every wallet with its balance, valued by
Binance in BTC (the documented default of `quoteAsset`): Spot, Funding, Cross
and Isolated Margin, USDⓈ-M and COIN-M Futures, Earn, Options, Trading Bots,
Copy Trading. Their sum is multiplied by the public BTCUSDT price.

- **Stablecoins:** Binance values them in BTC, then the BTCUSDT price turns
  BTC into USDT, and **one USDT is counted as one US dollar**.
- **Counted:** whatever Binance puts in a wallet balance, including Earn
  (flexible and locked products) and futures wallets.
- **Not counted:** anything the wallet list leaves out; sub-accounts and
  Binance Web3 Wallet aren't in it as far as the docs show.
- The value is rounded to the dollar.

`assets` counts distinct assets with a positive free, locked, frozen or
withdrawing amount in any wallet. When Binance sends no per-asset detail, the
metric is empty rather than 0.

Binance.US is a different exchange (`api.binance.us`) and isn't supported.

## Limits

The wallet call weighs 60 of the 12,000 a minute each SAPI endpoint allows per
IP; the price call weighs 2 on the spot API's own budget. Every Flexwall
connection shares the server's IP, so values stay fresh 30 minutes: 200
refreshes a minute fill the budget, about 6,000 connections spread over 30
minutes. Connecting costs 21 (`apiRestrictions` 1, `account` 20).

## Errors

- `-2015`, `-2014`, `-1002` or HTTP 401: the key was deleted, or its IP
  restriction doesn't allow Flexwall's server.
- `-1022`: the secret doesn't belong to the key.
- **HTTP 451** (Binance doesn't serve the country the server is in) and **HTTP
  403** (Binance's firewall): not something the owner can fix. Logged and
  passed through, so the tile keeps its last value. A Flexwall server in a
  restricted location can't use this connector.
- 429, 418, `-1021` (the server clock is outside `recvWindow`) and 5xx pass
  through.

## Signing

The signature is HMAC-SHA256, in hex, of the query string ending with
`recvWindow=5000&timestamp=<ms>`, keyed with the secret key. `binanceSignature`
uses WebCrypto and is tested against both HMAC examples in Binance's SIGNED
request documentation.

## Not verified against a real account

- That `quoteAsset` still defaults to BTC and that wallet balances are
  strings in BTC (the documented example shows a USDT asset whose
  `btcValuation` equals its amount, which looks wrong).
- That `needBalanceDetail=true` returns detail for every wallet, including
  Earn and futures; if some wallets come back without it, `assets` is a floor.
- That locked Earn products, staking and Trading Bots are inside the wallet
  balances as the wallet names suggest.
- The key-setting labels used in refusal messages, apart from Enable Spot &
  Margin Trading and Permits Universal Transfer, which the docs quote.
- The HTTP status Binance uses for `-2015` (401 is assumed; the error code is
  checked first either way).
- Fixtures are the documented example responses, not recorded ones.

## Develop

```bash
bun test plugins/binance
bunx tsc --noEmit -p plugins/binance/tsconfig.json
```
