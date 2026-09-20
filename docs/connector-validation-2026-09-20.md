# Connector validation — 2026-09-20

This is a dated operational snapshot, not a blanket certification. API provenance badges do not establish that every connector has passed a production account test.

## Observed production configuration

The production administration page lists 38 installed connectors and 31 public connectors. Enable Banking, Instagram, Plaid, Powens, SnapTrade and TikTok remain sandbox/admin-only. Steam is off because its API key is missing. Stripe and Your API each have one saved connection; other account-based connectors have no saved connection in the observed administration page.

## Live public API checks

The actual connector implementations were run locally using GuardedRuntime and real network requests. These checks do not constitute deployed OAuth end-to-end tests.

| Connector | Sample | Result |
| --- | --- | --- |
| npm | react | Download counts and 30 daily points returned |
| Bluesky | jay.bsky.team | Followers, following and post counts returned |
| Hacker News | pg | Karma and submission counts returned |
| Chess.com | hikaru | Ratings and game counts returned |
| Lichess | DrNykterstein | Bullet rating, games and play time returned |
| PyPI | requests | HTTP 429 from pypistats.org; not validated |

## Provider approvals and blockers

| Provider | Evidence and work completed | Remaining work |
| --- | --- | --- |
| SnapTrade | Approval email and authenticated dashboard confirm production eligibility. Existing integration still uses the test client. | Owner must generate the production credential; then securely configure it, confirm the commercial plan and test a real read-only connection before public activation. |
| TikTok | Production draft prepared with Flexwall description, logo, legal URLs, Login Kit, user.info.basic, user.info.stats and OAuth callback. Domain ownership proof deployed; TikTok explicitly confirmed the URL prefix as verified. | The form now has only one error: missing demo video. Unsaved draft remains open in Chrome. Record a genuine sandbox end-to-end video with an authorized test account, save draft and submit for review. No approval claimed. |
| Instagram | Meta saved Flexwall legal URLs, contact, logo and productivity category. instagram_business_basic added and shown as ready for testing. | Meta reports zero API test calls. Connect a professional test account, complete the real API test and App Review/advanced access requirements. Application remains unpublished. |
| Plaid | Latest relevant email requires an exchange with the provider; Chrome is signed out. | Owner login, provider commercial/compliance process and real production test. |
| Powens | Flexwall configuration points to sandbox; Chrome is signed out. | Owner login, inspect production approval and credentials, then real production test. |
| Enable Banking | Authenticated dashboard shows only an active sandbox application. Billing page says no billing account is accessible and offers a quote/agreement request. | Commercial agreement, production application and credentials, then real account test. |
| Steam | API key missing in production administration. | Authorized API key and real fetch test. |

No provider messages were sent and no paid account connection, subscription or financial transaction was initiated during this verification.

## Deployment verification

The first deployment of the TikTok ownership file was blocked by a flaky SnapTrade test that assumed a fixed order for concurrent balance requests. The assertion now compares sorted request lists while retaining exact membership and count checks. All 30 SnapTrade tests pass locally; the subsequent CI typecheck, tests and build passed.

Production deployment 35519090258 succeeded at commit 60c15f2. The public TikTok verification file was fetched successfully and TikTok confirmed ownership. The only remaining TikTok form error is the required end-to-end demonstration video; the form cannot save until it is supplied.
