# Architecture

This is the map. The contracts themselves live in `packages/sdk` and are the
source of truth; this page explains how the pieces fit.

## Repository

```
flexwall/
├── apps/web/                 the hosted app (Next.js, AGPL-3.0)
│   ├── src/app/              routes: public walls, editor, explore, API
│   ├── src/server/           host runtime: auth, store, billing, resolver, renderers
│   ├── src/components/       editor and page UI
│   └── src/plugins.ts        the list of installed plugins
├── packages/sdk/             @flexwall/sdk (MIT): types, define*, UI primitives, formatting, test kit
├── plugins/                  one folder per plugin (MIT)
│   ├── core/                 generic widgets: stat, goal, countdown, sparkline, heatmap, text, link
│   ├── github/               connector
│   ├── stripe/               connector
│   └── …
├── templates/plugin/         what `bun run new-plugin` copies
└── docs/                     you are here
```

Bun workspaces. Packages ship TypeScript source; Next's Turbopack compiles
workspace packages directly, so there is no build step between editing a
plugin and seeing it in the app.

## The three contracts

### 1. Values

Everything that flows from a connector to a widget is a `Value`:

| type | shape | example |
|---|---|---|
| `number` | `{ value, unit?, currency? }` | MRR, followers |
| `series` | `{ points: [{ t: "YYYY-MM-DD", v }] }` | MRR over 30 days |
| `calendar` | `{ days: [{ date, count, level }] }` | contribution graph |
| `text` | `{ value }` | latest release name |

Widgets declare which types each input accepts. Any connector metric of that
type fits. This is what keeps widgets and connectors independent: N widgets
and M connectors give N×M combinations for N+M pieces of code.

### 2. Connectors: where a value comes from

```ts
defineConnector({
  id: "stripe",
  name: "Stripe",
  tier: "pro",               // pro connectors need a paid owner to render publicly
  verified: true,            // values come from the owner's own credentials
  auth: { fields: [...] },   // omitted for public data (npm downloads, GitHub stars)
  metrics: [{ id: "mrr", name: "MRR", type: "number", unit: "currency" }],
  ttl: 1800,
  async connect(input, ctx) { … return { secret, public, label } },
  async fetch({ metrics, params, secret }, ctx) { … return { mrr: number(4820) } },
  sample: { mrr: number(4820) },
})
```

Rules a connector must follow (checked in review, see `plugins.md`):

- **All network goes through `ctx.fetch`**, the host's guarded fetch: https
  only, private and metadata addresses refused at connect time, no redirects,
  size and time limits. Never `fetch`, `node:http(s)` or an SDK that opens its
  own sockets.
- **Secrets only through `connect()`'s `secret`.** The host encrypts them
  (AES-256-GCM) and hands them back to `fetch()` only.
- **Least privilege.** Refuse full-access keys when a read-only kind exists.
- **Degrade, don't throw into rendering.** Return `null` for a metric the
  upstream has no answer for; throw `ConnectorError` with a sentence for
  anything the owner can fix.

### 3. Widgets: how a value is shown

```ts
defineWidget({
  id: "stat",
  name: "Stat",
  inputs: [{ key: "value", label: "Number", accepts: ["number"] }],
  options: [text("label"), text("prefix"), number("goal", { optional: true })],
  size: { default: [2, 1], min: [1, 1], max: [4, 2] },
  render({ inputs, options, box, theme, u }) {
    return <Col>…</Col>;
  },
})
```

A widget renders **once, for every output**. The page, the share card and the
lock screen all call the same `render`. Two constraints make that possible:

- **Satori-safe markup.** Images are drawn by Satori, which understands
  flexbox and absolute positioning, not CSS grid, and requires `display: flex`
  on any element with several children. The SDK's `Row`, `Col`, `Text` and
  `Svg` primitives take care of it. No hooks, no event handlers, no classes:
  inline styles only.
- **Sizes in units, never pixels.** `u(n)` is n hundredths of a grid cell. On an
  image it returns pixels; on the page it returns a CSS length tied to the
  tile's width through container query units. A widget written with `u()`
  scales from a 1×1 tile on a phone to a 4×2 tile on a share card.

A widget may export `renderWeb` for an interactive or richer page version
(tooltips, links). It must still be a pure function of its props.

## Walls, layouts, surfaces

```ts
Wall {
  id, owner, handle, title, bio, theme,
  tiles: Tile[],
  lockscreen: { device, placements: { [tileId]: Box } },
}
Tile {
  id, widget: "stat",
  inputs: { value: Binding },
  options: { label: "MRR", prefix: "$" },
  visibility: "public" | "private",
  layout: Box,                 // { x, y, w, h } on the 4-column wall grid
}
Binding =
  | { kind: "metric", connector: "stripe", metric: "mrr", params: {}, connection?: "c_…", history?: "30d" }
  | { kind: "static", value: Value }
```

One grid model, several adapters:

| Surface | Grid | Rendered by |
|---|---|---|
| Wall page (desktop) | 4 columns, square cells | CSS grid, server components |
| Wall page (mobile) | 2 columns, derived from the desktop order | CSS grid |
| Editor | same grid, draggable and resizable | react-grid-layout (client island) |
| Share card | 1200×630, top public tiles | Satori, boxes → absolute positions |
| Lock screen | 4 columns in the safe band between clock and buttons | Satori |

## Resolving a wall

`apps/web/src/server/resolve.ts` turns a wall into rendered-ready inputs:

1. Collect every binding on the surface being drawn (public tiles only for
   the page and card).
2. Group them by `connector + connection + cacheKey`, so eight tiles over
   three accounts cost three upstream calls.
3. For each group: fresh cached values → use them. Otherwise fetch once
   (single flight), wait at most 4 s, fall back to the last known values.
4. Gate by tier: a `pro` connector on a free owner's public wall resolves to a
   "needs Pro" placeholder.
5. `history` bindings read daily snapshots, written by a scheduled job for
   every metric used by a Pro wall.

Caches: process memory, then Firestore (`values/{key}`), so a cold Cloud Run
instance doesn't refetch. Only renders that matter (page, card, lock screen)
write; editor previews stay in memory.

## Identity and billing

- **Accounts:** email magic links (Gmail API sender), a signed session
  cookie. A handle is claimed once, atomically, against a reserved-words list.
- **Connections** belong to the user, not a wall, and can feed any wall they own.
- **Plans:** `free`, `pro` (Stripe subscription, monthly or yearly), `lifetime`
  (one-time). `entitlements(user)` is the only place that reads a plan; the
  webhook keeps `user.plan` in sync with subscription events.

## Data (Firestore)

| Collection | Doc | Holds |
|---|---|---|
| `users` | uid | email, handle, plan, Stripe customer and subscription state |
| `handles` | handle | uid (uniqueness) |
| `walls` | id | owner, handle, theme, tiles, lock screen placements, image nonce |
| `connections` | id | owner, connector, label, public details, sealed secret |
| `values` | cache key | last values fetched and when |
| `snapshots` | series key | daily points for history |
| `payments` | Stripe event id | idempotency for webhooks |

## Security model

- Session cookie (HMAC) for owners; capability URL (HMAC + nonce) for the lock
  screen image, which the Shortcut fetches without cookies.
- Secrets sealed with `FLEXWALL_ENCRYPTION_KEY`; views sent to browsers never
  include them.
- User URLs only through the guarded fetch. The service account on Cloud Run
  can mint Workspace mail tokens from the metadata server; the guard is what
  keeps a "custom API" tile from reaching it.
- User content on public pages: text only, links `rel="nofollow ugc noopener"`,
  a report link on every wall.
- Plugins are compiled in, reviewed by pull request. There is no runtime
  plugin loading on the hosted service.
