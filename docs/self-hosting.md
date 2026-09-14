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
| `GITHUB_TOKEN` | no | A token with no scopes. Raises GitHub's API limit from 60 to 5000 calls an hour for stars and followers. |
| `YOUTUBE_API_KEY` | for YouTube tiles | A YouTube Data API v3 key. Without it, YouTube tiles say the server has no key. |
| `MODERATION_INBOX` | no | Where wall reports are sent. |

Stripe webhook endpoint: `https://<your host>/api/webhooks/stripe`, with
`checkout.session.completed` and `customer.subscription.created`, `.updated`,
`.deleted`.

## Firestore

Collections are prefixed `fw_`. Queries use single-field equality filters only,
so no composite indexes are needed.

## Security notes

- Put the app behind HTTPS. Session cookies are `Secure` in production.
- The guarded fetch blocks private and metadata addresses from connectors. If
  your platform exposes internal services on other ranges, add them in
  `apps/web/src/infrastructure/net/guarded-fetch.ts`.
- Keep `FLEXWALL_ENCRYPTION_KEY` out of the image and out of logs; mount it as a secret.
