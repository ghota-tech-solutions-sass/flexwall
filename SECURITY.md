# Security

Flexwall stores people's API credentials. Security reports get priority.

## Reporting

Email **security@flexwall.lol** with what you found, how to reproduce it and
what it gives an attacker. Please don't open a public issue, and give us a
reasonable time to fix it before publishing.

We'll acknowledge within 3 working days and keep you updated.

## In scope

- Reading or using another user's connector credentials, wall or account
- Reaching internal or metadata addresses through connectors (server-side request forgery)
- Bypassing plan gating to show Pro data publicly, or faking a verified badge
- Session, sign-in link or lock screen link forgery
- Cross-site scripting or request forgery in the app

## How credentials are handled

- Encrypted with AES-256-GCM before storage, decrypted only to fetch values.
- Never sent to browsers, never logged.
- Connectors reach the network only through a guarded fetch that checks every
  resolved address at connect time and refuses redirects.
- Plugins are compiled in and reviewed; there is no runtime plugin loading.
