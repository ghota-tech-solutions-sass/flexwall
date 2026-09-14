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
- **Data.** Metrics are typed by hand, or read from GitHub's public
  contribution calendar (`src/lib/sources/github.ts`, no token, cached 3h).
  "Today" is computed in the owner's time zone.
- **Pro.** $4.99 one-time per wallpaper through Stripe hosted Checkout. The
  webhook and the success redirect both call `unlockFromSession`, idempotent
  per session. Pro unlocks four themes, removes the watermark and allows the
  public gallery. Pro themes preview for free; the phone gets Ink until paid.

## Routes

| Route | What |
|---|---|
| `/` · `/new` · `/edit/[id]?k=` | Landing, editor, private editor |
| `/i/[id]/[key]` | The wallpaper PNG the Shortcut fetches (`?c=&w=` for editor drafts) |
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

Required on the service: `FLEXWALL_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` (secret references), `GOOGLE_PROJECT_ID`, and
optionally `EMAIL_IMPERSONATE`/`EMAIL_FROM` for the Pro receipt. The Stripe
webhook listens for `checkout.session.completed` and
`checkout.session.async_payment_succeeded`.
