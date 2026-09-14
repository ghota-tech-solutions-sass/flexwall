import { ConnectorError, defineConnector, definePlugin, field, HttpError, money, number, type ConnectorContext, type FetchResult, type FieldValues } from "@flexwall/sdk";

/**
 * The native coin balance of a public address, from keyless public endpoints:
 * mempool.space for Bitcoin, PublicNode JSON-RPC for Ethereum, Base and Solana,
 * and Coinbase's spot price for the USD value. No account, no server key.
 *
 * Not verified: anyone can paste any address, so a tile proves nothing about
 * who owns the coins. Both amounts are sensitive: public surfaces print ranges.
 */

export type Chain = "bitcoin" | "ethereum" | "base" | "solana";

interface ChainInfo {
  name: string;
  /** The native coin, also the Coinbase price pair's base. Base pays gas in ETH. */
  symbol: "BTC" | "ETH" | "SOL";
  /** Base units per coin, as a power of ten: satoshis, wei, lamports. */
  decimals: number;
}

export const CHAINS: Record<Chain, ChainInfo> = {
  bitcoin: { name: "Bitcoin", symbol: "BTC", decimals: 8 },
  ethereum: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  base: { name: "Base", symbol: "ETH", decimals: 18 },
  solana: { name: "Solana", symbol: "SOL", decimals: 9 },
};

export const MEMPOOL = "https://mempool.space/api/address/";
export const RPC = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  solana: "https://solana-rpc.publicnode.com",
} as const;
export const PRICE = "https://api.coinbase.com/v2/prices/";

/** Legacy (1…) and P2SH (3…) in base58; bech32 SegWit (bc1q…) and taproot (bc1p…), all lowercase or all uppercase. */
const BITCOIN = "[13][1-9A-HJ-NP-Za-km-z]{25,34}|bc1[qp][02-9ac-hj-np-z]{38,58}|BC1[QP][02-9AC-HJ-NP-Z]{38,58}";
/** Any case: nodes don't check the EIP-55 checksum. */
const EVM = "0x[0-9a-fA-F]{40}";
/** A 32-byte public key in base58. */
const SOLANA = "[1-9A-HJ-NP-Za-km-z]{32,44}";

const whole = (source: string) => new RegExp(`^(?:${source})$`);
const PATTERNS: Record<Chain, RegExp> = { bitcoin: whole(BITCOIN), ethereum: whole(EVM), base: whole(EVM), solana: whole(SOLANA) };

const chain = field.select(
  "chain",
  "Chain",
  (Object.keys(CHAINS) as Chain[]).map((value) => ({ value, label: CHAINS[value].name })),
  { default: "bitcoin" }
);

const address = field.text("address", "Address", {
  // The genesis block's address: valid, public, and the editor's tests build tiles from placeholders.
  placeholder: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  help: "A public address on the chosen chain: bc1…, 0x… or a Solana address. Never paste a private key or a seed phrase.",
  maxLength: 90,
  // Any chain's form: the field can't see the chosen chain, so fetch checks the pair.
  pattern: `^(?:${BITCOIN}|${EVM}|${SOLANA})$`,
  patternMessage: "isn't a Bitcoin, EVM or Solana address",
});

/** The address as the upstream and the cache see it: EVM hex and bech32 are case-insensitive, base58 is not. */
export function normalizeAddress(chainId: string, raw: string): string {
  const value = raw.trim();
  if (chainId === "ethereum" || chainId === "base") return value.toLowerCase();
  if (chainId === "bitcoin" && /^bc1/i.test(value)) return value.toLowerCase();
  return value;
}

/** An integer amount of base units as coins, exact up to what a double can hold: 1234567890000000000000 wei is 1234.56789 ETH. */
export function fromBaseUnits(amount: bigint, decimals: number): number {
  const unit = 10n ** BigInt(decimals);
  const sign = amount < 0n ? "-" : "";
  const abs = amount < 0n ? -amount : amount;
  return Number(`${sign}${abs / unit}.${(abs % unit).toString().padStart(decimals, "0")}`);
}

function readParams(params: FieldValues): { id: Chain; info: ChainInfo; address: string } {
  const id = String(params.chain ?? "bitcoin") as Chain;
  const info = CHAINS[id];
  if (!info) throw new ConnectorError(`Crypto wallet doesn't support the chain ${String(params.chain)}.`);
  const value = normalizeAddress(id, String(params.address ?? ""));
  if (!PATTERNS[id].test(value)) throw new ConnectorError(`${value} isn't a ${info.name} address.`);
  return { id, info, address: value };
}

interface MempoolAddress {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

/** Confirmed satoshis only: unconfirmed transactions can still be replaced or dropped. */
async function bitcoinBalance(ctx: ConnectorContext, value: string): Promise<bigint> {
  try {
    const body = await ctx.fetch.json<MempoolAddress>(`${MEMPOOL}${encodeURIComponent(value)}`);
    const stats = body.chain_stats;
    return BigInt(stats.funded_txo_sum) - BigInt(stats.spent_txo_sum);
  } catch (error) {
    // mempool.space answers 400 with plain text: "Invalid Bitcoin address" or "Address on invalid network".
    if (error instanceof HttpError && error.status === 400) {
      if (/network/i.test(error.body)) throw new ConnectorError(`${value} isn't a Bitcoin mainnet address.`);
      throw new ConnectorError(`${value} isn't a valid Bitcoin address.`);
    }
    throw error;
  }
}

interface RpcAnswer<T> {
  result?: T;
  error?: { code: number; message: string };
}

/** JSON-RPC answers errors with HTTP 200 and an `error` object. Invalid params are the owner's to fix; the rest (rate limits, node trouble) aren't. */
async function rpc<T>(ctx: ConnectorContext, url: string, method: string, params: unknown[], invalid: string): Promise<T> {
  const body = await ctx.fetch.json<RpcAnswer<T>>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (body.error) {
    if (body.error.code === -32602) throw new ConnectorError(invalid);
    throw new Error(`JSON-RPC error ${body.error.code} from ${new URL(url).host}: ${body.error.message}`);
  }
  if (body.result === undefined || body.result === null) throw new Error(`JSON-RPC answer without a result from ${new URL(url).host}`);
  return body.result;
}

async function balanceOf(ctx: ConnectorContext, id: Chain, value: string): Promise<bigint> {
  const invalid = `${value} isn't a valid ${CHAINS[id].name} address.`;
  switch (id) {
    case "bitcoin":
      return bitcoinBalance(ctx, value);
    case "ethereum":
    case "base":
      return BigInt(await rpc<string>(ctx, RPC[id], "eth_getBalance", [value, "latest"], invalid));
    case "solana":
      return BigInt((await rpc<{ value: number }>(ctx, RPC.solana, "getBalance", [value], invalid)).value);
  }
}

async function usdPrice(ctx: ConnectorContext, symbol: string): Promise<number> {
  const body = await ctx.fetch.json<{ data?: { amount?: string } }>(`${PRICE}${symbol}-USD/spot`);
  const price = Number(body.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Coinbase answered no USD price for ${symbol}`);
  return price;
}

const params = [chain, address];

const cryptoWalletConnector = defineConnector({
  id: "crypto-wallet",
  name: "Crypto wallet",
  description: "The native coin balance of a public Bitcoin, Ethereum, Base or Solana address, in coins or US dollars.",
  tier: "free",
  verified: false,
  // Public nodes publish no limits; balances of a wall don't need to move faster than this.
  ttl: 30 * 60,
  metrics: [
    {
      id: "balance-usd",
      name: "Balance in USD",
      description: "The native coin balance valued at Coinbase's spot price.",
      type: "number",
      unit: "currency",
      params,
      defaults: { label: "in the wallet" },
      sensitive: true,
    },
    {
      id: "balance",
      name: "Balance in coins",
      description: "BTC, ETH or SOL held by the address. Tokens aren't counted.",
      type: "number",
      params,
      defaults: { label: "BTC" },
      sensitive: true,
    },
  ],

  // One balance answers both metrics of an address; the price is only asked for when a tile wants dollars.
  cacheKey: ({ params: p }) => {
    const id = String(p.chain ?? "bitcoin");
    return `${id}:${normalizeAddress(id, String(p.address ?? ""))}`;
  },

  async fetch({ metrics, params: p }, ctx) {
    const { id, info, address: value } = readParams(p);
    const wantsUsd = metrics.includes("balance-usd");
    const [units, price] = await Promise.all([balanceOf(ctx, id, value), wantsUsd ? usdPrice(ctx, info.symbol) : Promise.resolve(null)]);
    const coins = fromBaseUnits(units, info.decimals);
    // The balance comes with every request; dollars only when asked for.
    const values: FetchResult = { balance: number(coins) };
    if (price !== null) values["balance-usd"] = money(Math.round(coins * price * 100) / 100, "usd");
    return values;
  },

  sample: {
    "balance-usd": money(128_430, "usd"),
    balance: number(1.6348),
  },
});

export default definePlugin({
  id: "crypto-wallet",
  name: "Crypto wallet",
  description: "Native coin balances of public Bitcoin, Ethereum, Base and Solana addresses.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [cryptoWalletConnector],
});

export { cryptoWalletConnector };
