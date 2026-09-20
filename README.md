# Flexwall

**Your numbers, live, on one page.**

Flexwall is a public page made of tiles you drag onto a grid. Each tile shows
a real number from the account that produces it: MRR from Stripe, a streak from
GitHub, anything with an API. The same wall becomes the card X unfolds when you
share it, and a lock screen your iPhone redraws every morning.

Hosted at [flexwall.lol](https://flexwall.lol). Open source, and built to be
extended: a new data source or a new way to show one is a folder and a pull
request.

![A wall's share card](https://flexwall.lol/demo/card.png)

## What's in the box

- **Walls** at `/@handle`: a 4-column grid on desktop, a derived 2-column one on phones.
- **Editor**: widget library, drag and resize, an inspector generated from each widget's declared options.
- **Connectors**:
  - Code and audience: GitHub, npm, PyPI, Bluesky, Hacker News, YouTube, X (your own API key, you choose the refresh rate and see its cost), Twitch, TikTok, Instagram, WakaTime, Monkeytype, Steam, Chess.com, Lichess.
  - Revenue, verified: Stripe, Lemon Squeezy, Polar, Paddle, RevenueCat, Gumroad.
  - Website traffic: Plausible and Google Analytics 4 (users, visits, pageviews and daily visits).
  - Wealth, verified: brokerages worldwide through SnapTrade, US and Canadian banks and investments through Plaid, French banks, life insurance and PEA through Powens, bank accounts through Enable Banking (EU open banking), Alpaca, Trading 212, Interactive Brokers, Kraken, Binance, Coinbase. Public crypto wallets (Bitcoin, Ethereum, Base, Solana), unverified.
  - Sign in at the provider (OAuth) for Twitch, TikTok, Instagram, SnapTrade, Plaid, Powens and banks: tokens renew on their own, expired consents ask the owner to reconnect.
  - Any JSON endpoint.
- **Ranges for money**: balances and portfolios print as `$1M+` everywhere they leave the wall owner's editor, unless the owner asks a tile for the exact number.
- **Widgets**: number with goal, trend line, bars, stepped history, goal ring, heatmap, countdown, time left, note, link.
- **Source labels**: provider-verified, API-synchronized, manually entered, sample data, or last-known values. Labels remain visible on pages, share cards and lock screens. Personal APIs do not receive a verified badge.
- **Outputs**: server-rendered page, Open Graph card, iPhone lock screen through a Shortcut.
- **The Wall**: `/explore`, listed walls ranked by verified numbers: revenue, wealth, streaks, audience, stars.
- **Plans**: free, Pro (monthly or yearly) and lifetime, through Stripe.

## Quick start

```bash
bun install
bun run dev        # http://localhost:3000, memory store, sign-in links printed in the console
bun run test       # SDK, plugins and app: domain, use cases, adapters
bun run check      # typecheck, tests, production build, functional tests
```

No configuration is needed to run locally. See [docs/self-hosting.md](docs/self-hosting.md) for production.

## Repository

| Path | What | License |
|---|---|---|
| `apps/web` | The app: domain, use cases, adapters, Next.js routes and UI | AGPL-3.0 |
| `packages/sdk` | `@flexwall/sdk`: contracts, UI primitives and test kit for plugins | MIT |
| `plugins/*` | One folder per plugin: `core`, `github`, `stripe`, `http`, … | MIT |
| `templates/plugin` | What `bun run new-plugin` copies | MIT |
| `docs` | Vision, architecture, plugin guides | |

## Writing a plugin

```bash
bun run new-plugin lemon-squeezy "Lemon Squeezy"
bun install
bun test plugins/lemon-squeezy
```

Then read [docs/plugins](docs/plugins/README.md). In short: a **connector**
declares metrics and fetches them through `ctx.fetch`; a **widget** renders
values with Satori-safe markup sized in units. Connectors and widgets never
know about each other, which is why any new connector works in every widget.

## Documentation

- [Vision](docs/vision.md): what Flexwall is for and how it makes money
- [Architecture](docs/architecture.md): contracts, layers, rendering, data
- [Development](docs/development.md): project layout, conventions, tests
- [Plugins](docs/plugins/README.md): [connectors](docs/plugins/connectors.md), [widgets](docs/plugins/widgets.md), [themes](docs/plugins/themes.md)
- [Self-hosting](docs/self-hosting.md)
- [Deploying flexwall.lol](docs/deployment.md)
- [Search and sharing](docs/seo.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## License

The app (`apps/web`) is licensed under the [GNU AGPL-3.0](LICENSE): you can run,
modify and host it; if you offer a modified version as a service, you share your
changes. The SDK, the plugins and the plugin template are [MIT](packages/sdk/LICENSE),
so anyone can build on them freely.

### Public page-view counters

`POST /api/visits` counts visible public-page navigations after 600 ms. Reloads count again; these are **page views, not unique visitors**. Private screens, nonexistent walls, known bot user agents, DNT/GPC opt-outs and cross-origin requests are excluded. The official wall is a subset of site traffic. No historical traffic is backfilled: `trafficStartedAt` in `/api/public-stats` records the first counted view. Public totals and connector values may lag by several minutes due to caching.

The counter stores aggregate Firestore shards and bounded hashed random event receipts for retry deduplication (pruned on subsequent writes, max 512 per shard). It stores no IP, referrer, cookie or persistent visitor identifier. Hosting infrastructure logging is separate. Browser events can still be blocked or fabricated: the API provenance badge does not certify unique people or an audited audience. `Connect official visits` appends the two counters to the existing official wall, idempotently, without resetting totals or changing existing tiles.
