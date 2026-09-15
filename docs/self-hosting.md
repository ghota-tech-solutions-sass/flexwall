# Self-hosting

Flexwall is a Next.js app with a document store, a mailer and optional
payments. flexwall.lol runs it on Google Cloud Run with Firestore; any host that
runs a Docker image works.

## Build and run

```bash
docker build -t flexwall .
docker run -p 3000:3000 --env-file .env flexwall
```

## Configuration

| Variable | Required | What |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | Public origin, e.g. `https://flexwall.example`. Used in links and redirects. Build-time too. |
| `FLEXWALL_SECRET` | yes | Signs sessions, sign-in links and lock screen links. `openssl rand -base64 32`. Rotating it signs everyone out and breaks lock screen links. |
| `FLEXWALL_ENCRYPTION_KEY` | yes | 32 bytes, base64, for connector credentials. `openssl rand -base64 32`. Rotating it makes stored credentials unreadable: owners reconnect. |
| `GOOGLE_PROJECT_ID` | for Firestore | Without it, data lives in memory and is lost on restart. |
| `EMAIL_IMPERSONATE`, `EMAIL_FROM` | for email | Gmail API through domain-wide delegation. Without them, sign-in links are printed in the server log. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for payments | Flexwall's own billing. Without them, upgrades say payments are off. |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_LIFETIME` | no | Stripe price ids. Without them, inline prices ($6, $48, $99) are used. |
| `STRIPE_PORTAL_CONFIGURATION` | no | Customer portal configuration id. Without it Stripe uses the account's default portal, which must then be saved once in the dashboard. |
| `STRIPE_REFERRAL_COUPON` | no | Stripe coupon id for invitees (20% off, once). Without it, invitees pay full price; referrers still earn Pro months. |
| `GITHUB_TOKEN` | no | A token with no scopes. Raises GitHub's API limit from 60 to 5000 calls an hour for stars and followers. |
| `YOUTUBE_API_KEY` | for YouTube tiles | A YouTube Data API v3 key. Without it, YouTube tiles say the server has no key. |
| `STEAM_API_KEY` | for Steam tiles | A free Steam Web API key (steamcommunity.com/dev/apikey). |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | for Twitch | A Twitch application. See `plugins/twitch/README.md`. |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | for TikTok | A TikTok for Developers app with Login Kit. See `plugins/tiktok/README.md`. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | for Instagram | A Meta app with Instagram API with Instagram Login. See `plugins/instagram/README.md`. |
| `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` | for bank accounts | An Enable Banking application and its RSA private key (PEM). See `plugins/enable-banking/README.md`. |
| `MODERATION_INBOX` | no | Where wall reports are sent. |
| `ADMIN_EMAILS` | for the back office | Comma-separated emails that can open `/admin`: list accounts, offer Pro without payment, take walls offline. Empty or unset, `/admin` answers 404 to everyone. |

Connectors that sign in at a provider (Twitch, TikTok, Instagram, bank
accounts) send owners back to `https://<your host>/api/connections/oauth/callback`:
register exactly that address with each provider. Without its variables, a
connector still shows in the editor and says the server isn't set up for it.

Stripe webhook endpoint: `https://<your host>/api/webhooks/stripe`, with
`checkout.session.completed`, `customer.subscription.created`, `.updated`,
`.deleted`, and `charge.refunded` (takes back a referral reward after an early refund).

## Firestore

Collections are prefixed `fw_`. Queries use single-field equality filters only,
so no composite indexes are needed.

## Security notes

- Put the app behind HTTPS. Session cookies are `Secure` in production.
- The guarded fetch blocks private and metadata addresses from connectors. If
  your platform exposes internal services on other ranges, add them in
  `apps/web/src/infrastructure/net/guarded-fetch.ts`.
- Keep `FLEXWALL_ENCRYPTION_KEY` out of the image and out of logs; mount it as a secret.
