import type { PluginDef } from "@flexwall/sdk";
import officialStripe from "./official-stripe";
import flexwall from "./flexwall";
import core from "@flexwall/plugin-core";
import github from "@flexwall/plugin-github";
import http from "@flexwall/plugin-http";
import stripe from "@flexwall/plugin-stripe";
import npm from "@flexwall/plugin-npm";
import pypi from "@flexwall/plugin-pypi";
import bluesky from "@flexwall/plugin-bluesky";
import hackernews from "@flexwall/plugin-hackernews";
import lemonSqueezy from "@flexwall/plugin-lemon-squeezy";
import polar from "@flexwall/plugin-polar";
import googleAnalytics from "@flexwall/plugin-google-analytics";
import plausible from "@flexwall/plugin-plausible";
import youtube from "@flexwall/plugin-youtube";
import { DEFAULT_THEME_ID } from "@/domain/wall";
import alpaca from "@flexwall/plugin-alpaca";
import trading212 from "@flexwall/plugin-trading212";
import interactiveBrokers from "@flexwall/plugin-interactive-brokers";
import kraken from "@flexwall/plugin-kraken";
import binance from "@flexwall/plugin-binance";
import coinbase from "@flexwall/plugin-coinbase";
import cryptoWallet from "@flexwall/plugin-crypto-wallet";
import revenuecat from "@flexwall/plugin-revenuecat";
import paddle from "@flexwall/plugin-paddle";
import gumroad from "@flexwall/plugin-gumroad";
import wakatime from "@flexwall/plugin-wakatime";
import chessCom from "@flexwall/plugin-chess-com";
import lichess from "@flexwall/plugin-lichess";
import monkeytype from "@flexwall/plugin-monkeytype";
import twitch from "@flexwall/plugin-twitch";
import tiktok from "@flexwall/plugin-tiktok";
import instagram from "@flexwall/plugin-instagram";
import enableBanking from "@flexwall/plugin-enable-banking";
import steam from "@flexwall/plugin-steam";
import x from "@flexwall/plugin-x";
import snaptrade from "@flexwall/plugin-snaptrade";
import plaid from "@flexwall/plugin-plaid";
import powens from "@flexwall/plugin-powens";
import { createCatalog } from "./catalog";

/**
 * The installed plugins. Shared by server and browser: plugins hold no
 * secrets and reach the network only through the host's `ctx.fetch`, so the
 * editor renders widgets and draws connector forms from the same objects.
 *
 * Adding a plugin: `bun run new-plugin <id>`, then list it here.
 */
export const PLUGINS: readonly PluginDef[] = [core, flexwall, officialStripe, github, stripe, http, npm, pypi, bluesky, hackernews, lemonSqueezy, polar, plausible, googleAnalytics, youtube, alpaca, trading212, interactiveBrokers, kraken, binance, coinbase, cryptoWallet, revenuecat, paddle, gumroad, wakatime, chessCom, lichess, monkeytype, twitch, tiktok, instagram, enableBanking, steam, x, snaptrade, plaid, powens];

export const catalog = createCatalog(PLUGINS, DEFAULT_THEME_ID);
