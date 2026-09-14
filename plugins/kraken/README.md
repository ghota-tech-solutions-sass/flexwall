# Kraken

A Flexwall plugin that reads a verified portfolio value from a Kraken account.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `kraken` | Pro, verified. Metrics below, answered by one pass over the account. |

| Metric | Type | Where it comes from |
|---|---|---|
| `portfolio-value` | Money, US dollars. Sensitive: public walls show a range like "$100k+". Competes on the wealth leaderboard. | `POST /0/private/TradeBalance` with `asset=ZUSD`, field `eb` |
| `assets` | Count | `POST /0/private/Balance`, currencies with a positive balance |

## Credentials and permissions

An API key and its private key, from **Settings → API → Create API key**.

Give the key **Query Funds**. Read-only permissions such as Query Open Orders &
Trades, Query Closed Orders & Trades, Query Ledger Entries or Export Data are
accepted. Connecting calls `GetApiKeyInfo`, which lists the key's permissions,
and **refuses** keys with any of: Deposit Funds, Withdraw Funds, Earn Funds,
Create & Modify Orders, Cancel/Close Orders, Add or Update withdrawal
addresses. The error names each permission to remove.

Kraken's reference lists `TradeBalance` under "Query Open Orders & Trades",
while its API key guide lists it under Query Funds. Connecting calls
`TradeBalance` to find out: if Kraken denies it, the owner is asked to add
Query Open Orders & Trades as well.

Use the key for Flexwall only. Kraken requires every request of a key to carry
a larger nonce than the last one; this connector uses microsecond timestamps,
and another app using millisecond nonces with the same key would be refused
afterwards (or refuse Flexwall's requests before).

The key and private key are encrypted by Flexwall. The connection list shows
the key's name as set in Kraken and the last four characters of the API key.
The connection id is a hash of the account's internal IBAN, so reconnecting
the same account replaces the connection without storing the IBAN.

## How the value is computed

- **Valuation.** `eb` is Kraken's own "equivalent balance (combined balance of
  all currencies)", valued by Kraken in US dollars. Nothing is converted by
  Flexwall. Stablecoins are valued at Kraken's price for them, so 1 USDT is
  close to, not exactly, 1 dollar.
- **Counted:** everything in the spot account that Kraken includes in `eb`.
- **Not counted:** Kraken Futures (a separate platform with its own API), and
  wallets other than the key's default wallet (`Balance` accepts an
  `account_id` for other wallets; this connector doesn't ask for one).
- The value is rounded to the dollar.

`assets` counts distinct currencies with a balance above zero. Legacy codes
and staking or rewards variants are folded into one currency: `XXBT`, `XBT.M`
→ BTC; `XETH`, `ETH2`, `ETH2.S` → ETH; `ZUSD`, `USD.M` → USD. Fiat and
stablecoins count. Fee credits (`KFEE`) don't.

## Limits

Each API key has a call counter with a maximum of 15 (Starter) or 20, decaying
by 0.33 to 1 a second. A refresh costs at most 2 calls (`TradeBalance`,
`Balance`), connecting costs 2 (`GetApiKeyInfo`, `TradeBalance`). Values stay
fresh 15 minutes. Rate limits (`EAPI:Rate limit exceeded`), throttling and
outages pass through, so the tile keeps its last value.

## Errors

Kraken answers HTTP 200 with an `error` array; this connector reads it.

- `EAPI:Invalid key`: the key was deleted.
- `EAPI:Invalid signature`: the private key doesn't belong to the key.
- `EAPI:Invalid nonce`: another app uses the key.
- `EGeneral:Permission denied`: a missing permission, named.
- `EAuth:Account temporary disabled`, `EAuth:Account unconfirmed`: account state.

## Signing

`API-Sign` is HMAC-SHA512 of the URI path followed by SHA-256(nonce + POST
data), keyed with the base64-decoded private key. `krakenSignature` uses
WebCrypto and is tested against the example in Kraken's authentication guide.

## Not verified against a real account

- Whether `eb` includes staked and Kraken Rewards balances (`.S`, `.M`, `.F`,
  `.B`), bonding or unbonding funds, and tokenized assets (`.T`).
- Which permission `TradeBalance` really needs (see above).
- The exact permission values `GetApiKeyInfo` returns for real keys, beyond
  the documented table, and that `iban` is always present.
- That form-encoded bodies are accepted for `GetApiKeyInfo` (the reference
  shows JSON; Kraken's introduction says both encodings are supported).
- Fixtures are the documented example responses, not recorded ones.

## Develop

```bash
bun test plugins/kraken
bunx tsc --noEmit -p plugins/kraken/tsconfig.json
```
