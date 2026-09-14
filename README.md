# flexwall.lol

**A lock screen that keeps score.**

Pick a goal, a countdown, your GitHub streak. Flexwall draws them into an
iPhone wallpaper at a private URL, and a Shortcuts automation sets it as the
lock screen every morning. No app, no account.

## How it works

- **Config, not accounts.** A wallpaper is a small JSON config
  (`src/lib/config.ts`). Saving returns two capability links, both HMACs of the
  wall id and a per-wall nonce (`src/lib/tokens.ts`): the image link the
  Shortcut fetches, and the edit link that is the owner's login. Rotating a
  nonce kills a leaked link.
- **Rendering.** `next/og` (Satori + resvg) draws a 402pt design scaled to the
  device's pixels (`src/lib/render.tsx`). The layout avoids the clock at the
  top and the flashlight/camera buttons at the bottom. Images are served
  `no-store`: a cached copy is the product failing silently.
- **Data.** Metrics are typed by hand (goal, number, countdown, year
  progress) or come from a connector. "Today" is computed in the owner's time
  zone.
- **Pro.** $4.99 one-time per wallpaper through Stripe hosted Checkout. The
  webhook and the success redirect both call `unlockFromSession`, idempotent
  per session. Pro unlocks the Stripe and API connectors, four themes, removes the watermark and allows the
  public gallery. Pro themes preview for free; the phone gets Ink until paid.

## Connectors

`src/lib/connectors/` — GitHub (free), Stripe and "Your API" (Pro).

| File | Role |
|---|---|
| `catalog.ts` | What a connector offers: metrics, their params, connection fields. Client-safe; the editor draws its forms from it |
| `types.ts` | The `Connector` interface: `fetch`, `cacheKey`, `ttlMs`, optional `connect`, `sample` |
| `<id>.ts` | One implementation per connector |
| `registry.ts` | `Record<ConnectorId, Connector>`: a catalog entry without an implementation doesn't compile |

The resolver (`src/lib/metrics.ts`) does everything around them: config
validation, decrypting connections, caching values per connector key (memory
+ on the wall doc, so cold instances don't refetch), one in-flight request per
key, serving the last known value when a refresh fails, and Pro gating (the
phone shows a dash until Pro; the owner's preview always shows the live number).

**Adding one** (say Polar): describe it in `catalog.ts`, implement
`src/lib/connectors/polar.ts`, add it to `registry.ts`. The registry test
checks the rest.

**Secrets.** A connection's `connect()` returns `secret` and `public` fields.
Secrets are sealed with AES-256-GCM (`src/lib/crypto.ts`,
`FLEXWALL_ENCRYPTION_KEY`) and never leave the server; configs only reference
a connection id. Stripe only accepts restricted `rk_` keys.

**Your API.** User URLs go through `src/lib/net/safe-fetch.ts`: https only,
every resolved address checked at connect time against private and metadata
ranges (DNS rebinding included), no redirects, 5s, 256 KB. This service runs
next to the Cloud Run metadata server, whose tokens can send Workspace mail.


## Routes

| Route | What |
|---|---|
| `/` · `/new` · `/edit/[id]?k=` | Landing, editor, private editor |
| `/i/[id]/[key]` | The wallpaper PNG the Shortcut fetches (saved config only) |
| `/api/walls/[id]/preview` | Owner preview of unsaved changes, with live connections (`x-edit-key`) |
| `/api/walls/[id]/connections` | Test and save a connection; `DELETE …/[conn]` forgets it |
| `/api/preview?c=` | Watermarked, size-capped preview of an unsaved config |
| `/p/[id]` · `/wall` | Gallery image and page (Pro + opted in only) |
| `/api/walls` · `/api/walls/[id]` · `/rotate` | Create, read/patch, new image link (`x-edit-key`) |
| `/api/checkout` · `/confirm` · `/api/webhooks/stripe` | Pro payment |

## Develop

```bash
bun install
bun dev          # walls in memory, checkout answers 503 without Stripe
task samples     # render every theme to .tmp/
bun run check    # typecheck, unit tests, build, functional tests on the standalone server
```

See `.env.example` for configuration.

## Deploy

Cloud Run service `flexwall` in `ghota-outflex-prod`, next to the old
leaderboard (`outflex`). Firestore collections are prefixed `fw_` because both
apps share the default database.

```bash
task deploy      # docker build (linux/amd64) → Artifact Registry → gcloud run deploy
```

gcloud only. Never `terraform apply` in that project: the old app's state has
drifted and would put a Stripe test key in front of live traffic.

Required on the service: `FLEXWALL_SECRET`, `FLEXWALL_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` (secret references), `GOOGLE_PROJECT_ID`, and
optionally `EMAIL_IMPERSONATE`/`EMAIL_FROM` for the Pro receipt and
`GITHUB_TOKEN` (no scopes) to lift the GitHub API limit from 60 to 5000 calls an hour. The Stripe
webhook listens for `checkout.session.completed` and
`checkout.session.async_payment_succeeded`.
