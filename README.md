# flexwall.lol

**Post your money. Take your rank.**

A public wall where the only thing bought, ranked and judged is money itself.
You pick a name, pay any amount through Stripe, and the wall shows your name,
your amount and your rank. Anyone can pay more and take your place. Nothing is
sold, nothing is shipped. The record is permanent. Inspired by
[outbid.lol](https://outbid.lol), minus the products.

Live at **[flexwall.lol](https://flexwall.lol)** · [How it works](https://flexwall.lol/how-it-works) · [About](https://flexwall.lol/about)

## Features

- **The wall** — server-rendered leaderboard: podium, live ticker, latest-move
  banner, reign counter for №01 ("№01 for 3 days · 2 challenges seen off")
- **Dynamic entry floor** — starts at $100 and rises as the wall fills
  ($250 at 25 entries, $500 at 50, $1,000 at 100). Top-ups have no minimum
- **Founder stars** — the first 100 seats keep a ★ for life
- **Share pages** — per-seat page with a canvas share card, a dynamic
  Open Graph image rendered on the fly, the public payment history
  ("money trail"), a view counter and a "Beat this seat" CTA
- **Identity links** — a display name like `@handle`, `x.com/handle` or
  `site.tld` becomes a safe outbound link (http/https only)
- **My seat** — signed session cookie set after checkout, plus email
  **magic links** for any other browser
- **Transactional email** through the Gmail API (Google Workspace,
  domain-wide delegation, no key file): welcome mail, seat link,
  and "you've been passed" alerts with a one-click top-up link
- **Idempotent Stripe webhook** — credits are keyed by event id inside a
  Firestore transaction; replays are ignored

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, SSR), TypeScript, React 19 |
| Runtime | Bun (multi-stage Docker, standalone output) |
| Payments | Stripe hosted Checkout (free amount) + signed webhook |
| Database | Firestore native — `entries` (one doc per name), `events` (payment journal) |
| Email | Gmail API via the runtime service account (domain-wide delegation) |
| Infra | GCP Cloud Run + Artifact Registry + Secret Manager |
| IaC | Terraform (GCS backend, Google + Stripe providers) |

## Quick start

```bash
bun install
bun dev            # http://localhost:3000
```

With no credentials at all the app runs in **demo mode**: a seeded in-memory
wall, and the entry form explains that payments are not wired. Fill a
`.env.local` (see `.env.example`) to make checkout and the webhook real:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # prints STRIPE_WEBHOOK_SECRET
```

### Local Firestore (optional)

| Mode | Trigger |
|---|---|
| Seeded memory (demo) | no `GOOGLE_PROJECT_ID` |
| Official emulator (real persistence) | `FIRESTORE_EMULATOR_HOST=localhost:8080` + `GOOGLE_PROJECT_ID=demo-flexwall` |

```bash
docker run -d --name fw-firestore-emulator -p 8080:8080 \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators \
  gcloud beta emulators firestore start --host-port=0.0.0.0:8080
```

## Tests

```bash
bun test tests/unit          # pure logic: identity, floor, ranking, sessions, store, reign, mail
bun test tests/functional    # boots the real standalone server and drives it over HTTP
bun run check                # full gate: tsc → unit → production build → functional
```

The functional suite covers every route (including the dynamic OG image),
security headers, checkout validation, the magic-link → cookie → `/api/me`
flow, and a **signed Stripe webhook** end to end (credit + replay ignored).
`bun run check` is the merge/deploy gate.

## Layout

    src/app/page.tsx                    # the wall (SSR leaderboard)
    src/app/share/[slug]/               # public seat page + dynamic OG image
    src/app/me/                         # "my seat" + magic-link landing
    src/app/api/checkout/route.ts       # Checkout session (free amount, dynamic floor)
    src/app/api/webhooks/stripe/        # signature check → idempotent credit → emails
    src/lib/store/entries.ts            # Firestore store (+ in-memory demo fallback)
    src/lib/email.ts                    # Gmail API sender (no stored credential)
    src/lib/session.ts                  # HMAC session + magic-link tokens
    terraform/                          # GCP project, Cloud Run, secrets, Stripe webhook
    tests/                              # unit + functional suites

## Deployment

1. **Secrets** — `cp terraform/terraform.tfvars.example terraform/terraform.tfvars`
   and fill in: project id, billing account, folder, Stripe key. Real secrets
   live only in untracked files (`.env.local`, `terraform.tfvars`); everything
   tracked carries placeholders.
2. **Infra** — `cd terraform && ./deploy.sh init && ./deploy.sh apply`
   creates the GCP project, Firestore, Cloud Run, Artifact Registry, the
   secrets, and the Stripe webhook endpoint (its signing secret is stored in
   Secret Manager automatically).
3. **App** — `./deploy.sh deploy` (Docker build → push → Cloud Run deploy),
   or build remotely with `gcloud builds submit`.

## What the webhook does

On `checkout.session.completed` (paid, or fully discounted by a promo code)
it credits `entries/{slug}` with the **declared** amount inside a Firestore
transaction, journals the event under its Stripe event id (replays are
no-ops), then sends the welcome mail and "you've been passed" alerts.
Same name paying again = top-up. Ties on the board go to whoever arrived
first.

## License

[MIT](LICENSE) — © 2026 Mickaël Villers / Ghota Tech Solutions.
Built in a weekend, largely AI pair-programmed, shipped in public.
