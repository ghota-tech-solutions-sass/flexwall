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
- **Connectors**: GitHub (streaks, contribution graph, stars, followers), Stripe (verified MRR, revenue, customers), any JSON endpoint.
- **Widgets**: number with goal, trend line, heatmap, countdown, time left, note, link.
- **Outputs**: server-rendered page, Open Graph card, iPhone lock screen through a Shortcut.
- **The Wall**: `/explore`, listed walls ranked by verified numbers.
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
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## License

The app (`apps/web`) is licensed under the [GNU AGPL-3.0](LICENSE): you can run,
modify and host it; if you offer a modified version as a service, you share your
changes. The SDK, the plugins and the plugin template are [MIT](packages/sdk/LICENSE),
so anyone can build on them freely.
