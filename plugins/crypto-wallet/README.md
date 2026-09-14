# Crypto wallet

The native coin balance of a public Bitcoin, Ethereum, Base or Solana address,
in coins or in US dollars. No account, no API key, nothing to configure on the
server.

## What it adds

| Kind | Id | What |
|---|---|---|
| Connector | `crypto-wallet` | The balance of one public address. Free, not verified. |

| Metric | Type | What |
|---|---|---|
| `balance-usd` | number, currency (usd), sensitive | The native balance times Coinbase's USD spot price, rounded to the cent. |
| `balance` | number, sensitive | BTC, ETH or SOL held by the address. |

Each tile picks a `chain` (`bitcoin`, `ethereum`, `base`, `solana`) and pastes
an `address`. The address field accepts every form of those chains: Bitcoin
legacy (`1…`), P2SH (`3…`), bech32 SegWit (`bc1q…`) and taproot (`bc1p…`);
EVM `0x` plus 40 hex digits, any case; Solana base58 public keys (32 to 44
characters). A field can't see the other field, so `fetch` checks the address
against the chosen chain and says so when they don't match.

The `balance` tile's default label is "BTC", matching the default chain;
rename the tile for ETH or SOL.

## Where the numbers come from

| Chain | Request | Unit |
|---|---|---|
| Bitcoin | `GET https://mempool.space/api/address/<address>` | `chain_stats.funded_txo_sum − chain_stats.spent_txo_sum`, satoshis |
| Ethereum | `POST https://ethereum-rpc.publicnode.com`, JSON-RPC `eth_getBalance(address, "latest")` | wei, hex |
| Base | `POST https://base-rpc.publicnode.com`, JSON-RPC `eth_getBalance(address, "latest")` | wei, hex (Base's native coin is ETH) |
| Solana | `POST https://solana-rpc.publicnode.com`, JSON-RPC `getBalance(address)` | lamports |
| Price | `GET https://api.coinbase.com/v2/prices/<BTC\|ETH\|SOL>-USD/spot` | `data.amount`, a decimal string |

Amounts are converted from base units with `BigInt`, so large wei balances
don't lose digits before the final conversion to a JS number.

**Bitcoin counts confirmed coins only.** `mempool_stats` (unconfirmed
transactions) is ignored: they can still be replaced or dropped, and a wall
shouldn't flex coins that may never arrive. A payment shows up once it has a
confirmation and the tile's 30 minutes are up.

**Why these providers.**

- mempool.space is the reference public Bitcoin explorer, with a documented
  keyless REST API.
- PublicNode (by Allnodes) serves keyless JSON-RPC for Ethereum, Base and
  Solana (and more EVM chains, like Arbitrum and Optimism, which could be added
  the same way). It answers directly, without redirects, in about 100 ms.
- Solana's own `api.mainnet-beta.solana.com` is not used: Solana's docs say
  the public endpoints "are not intended for production applications", limit
  each IP to 100 requests per 10 seconds, and may block high-traffic sites
  without notice, which is what a shared server's IP looks like.
- Coinbase's spot price endpoint needs no authentication and covers BTC, ETH
  and SOL against USD.

Only the requests a group needs are made: a `balance` tile alone never calls
Coinbase. When dollars are wanted, the balance and the price are fetched in
parallel.

## Tokens are out of scope

ERC-20 tokens, SPL tokens, NFTs, staked or wrapped coins aren't counted. Listing
the tokens an address holds, and pricing them, takes an indexer (Alchemy,
Moralis, Helius, Covalent…), and every reliable one needs an API key. This
connector works on a server with no configuration, so it stays with native
balances that one keyless call answers.

## Credentials and permissions

None. Addresses are public. Values aren't verified: anyone can paste anyone's
address, so a tile proves nothing about who owns the coins, and the connector
enters no leaderboard (the wealth board only counts verified connectors). Both
metrics are `sensitive`, so public surfaces print a range unless the owner
sets the tile to the exact number: "$1M+" for `balance-usd`, and "10+" for
`balance` (coin amounts get ranges from 1 upwards, "under 1" below).

Never paste a private key or a seed phrase: the field only needs the public
address.

## Rate limits

- mempool.space enforces rate limits without publishing numbers and answers
  429 past them; repeated abuse can get an IP banned.
- PublicNode publishes no numbers either and applies per-IP fair use.
- Coinbase's App API documents 10,000 requests an hour per key or user;
  unauthenticated limits aren't published.

Values stay fresh for 30 minutes (`ttl` 1800): below the one-hour default for
upstreams without published limits, because a balance can change with every
block, unlike a daily download count. Every tile showing the same
chain and address shares one group, so one address costs at most 48 balance
calls a day, plus 48 price calls when a tile shows dollars. The group key
lowercases EVM and bech32 addresses (case-insensitive) and keeps the case of
base58 addresses (legacy Bitcoin, Solana), where case matters.

## Errors

- Address that doesn't match the chosen chain: "… isn't a Bitcoin address.",
  before any request.
- mempool.space 400 `Invalid Bitcoin address`: "… isn't a valid Bitcoin
  address."; `Address on invalid network` (testnet): "… isn't a Bitcoin
  mainnet address."
- JSON-RPC errors arrive as HTTP 200 with an `error` object. Code `-32602`
  (invalid params, e.g. Solana's `WrongSize` for a Bitcoin address pasted on
  Solana): "… isn't a valid Solana address." Any other code (rate limits, node
  trouble) goes through as a plain error.
- HTTP 429, 5xx, and a failing price call when dollars are wanted go through
  untouched, so the host keeps the last good value.

## Develop

```bash
bun test plugins/crypto-wallet
```

Fixtures in `tests/fixtures/` are real answers captured from mempool.space,
PublicNode and Coinbase.
