# Flexwall: product vision

## One line

**The live public page for people who build things.** A grid of tiles like the
link-in-bio pages of old, except every tile is a real number pulled from the
account that produces it: MRR from Stripe, a streak from GitHub, subscribers
from YouTube, visitors from Plausible.

## Why now

- Bento, the grid profile page builders loved, shut down on 13 February 2026
  after Linktree bought it. Its users lost their pages with no export.
- "Build in public" runs on screenshots of dashboards. Screenshots are stale,
  unverifiable and cropped. TrustMRR showed there is demand for *verified*
  numbers, but only for revenue and only as a directory.
- Every builder already has the data in five tools. Nobody gives them one
  place that shows it, live, looking good.

## Who it's for

1. **Indie hackers and founders** who post their MRR and want it to be real.
2. **Open source maintainers** who want stars, downloads and sponsors in one place.
3. **Creators** who grow on several platforms and want a single, current page.

The first audience is the one we reach first: builders on X.

## What people get

**A wall** at `flexwall.lol/@handle`. Drag tiles onto a grid, resize them,
connect accounts. Each tile is a widget showing data from a connector. Tiles
fed by an account the owner connected carry a *verified* badge. Every tile is
private until the owner makes it public.

**Outputs of the same wall**, generated from the same widgets and layout:

| Output | What it is | Why it matters |
|---|---|---|
| Public page | `flexwall.lol/@handle`, server-rendered | The product. Goes in every bio |
| Share card | Open Graph image of the wall, always current | Every share on X is an ad |
| Lock screen | iPhone wallpaper redrawn every morning by a Shortcut | Daily habit, a reason to keep numbers fresh |
| Embeds (next) | SVG badge / iframe tile for READMEs and sites | Backlinks and reach |

**The Wall** at `flexwall.lol/explore`: public walls, ranked by verified
numbers (MRR, streaks, stars). It's where the name comes from, it's how new
people discover walls, and it's what makes a verified number worth having.

## Business model

Free is generous, because every public wall is distribution.

| | Free | Pro | Lifetime |
|---|---|---|---|
| Price | $0 | $6/month or $48/year | $99 once, founding members |
| Public wall, share card, Explore listing | ✓ | ✓ | ✓ |
| Widgets | 8 | Unlimited | Unlimited |
| Public connectors (GitHub, npm, Bluesky, HN…) | ✓ | ✓ | ✓ |
| Verified connectors with credentials (Stripe, Lemon Squeezy, Polar, Plausible, your API…) | | ✓ | ✓ |
| History charts (daily snapshots) | | ✓ | ✓ |
| Lock screen without watermark, all themes | | ✓ | ✓ |
| "Made with Flexwall" footer removable | | ✓ | ✓ |
| Custom domain (next) | | ✓ | ✓ |

The lifetime plan funds the launch and rewards the first believers. It's
capped and will close; MRR comes from the subscription.

Later revenue, once Explore has traffic: sponsored placements on Explore,
the way TrustMRR sells sponsor slots.

## The growth loop

1. A builder makes a wall and puts `flexwall.lol/@handle` in their bio.
2. Visitors see live, verified numbers and a "Make your wall" link.
3. Sharing the wall on X unfurls into a card with the numbers on it.
4. Explore ranks walls by verified numbers: connecting Stripe earns a place.
5. The lock screen and the daily numbers bring owners back.

## Open source

The app is AGPL-3.0: anyone can self-host and read how their keys are
handled, and a hosted competitor has to publish its changes. The SDK and
every plugin are MIT, so anyone can write a widget or a connector.

Trust is a feature here. People paste Stripe keys into this product; being
able to read the code that stores them is part of why they will.

## Principles

- **Real numbers or nothing.** A tile says where its number comes from.
- **Private by default.** Nothing is public until its owner says so, tile by tile.
- **Read-only, least privilege.** We refuse keys that can do more than read.
- **One layout, every output.** Build the wall once; the page, card and lock screen follow.
- **Extensible by the community.** A new data source is one folder and one pull request.
