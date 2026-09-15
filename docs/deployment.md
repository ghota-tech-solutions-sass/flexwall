# Deploying flexwall.lol

How the hosted service is built, released and configured. To run Flexwall on
your own host, see [self-hosting.md](self-hosting.md).

## Pieces

| What | Where | Changed by |
|---|---|---|
| Project, Firestore, Cloud Run service `flexwall`, domain mappings, secrets, Artifact Registry, IAM, YouTube key | `terraform/` | Terraform Apply workflow |
| Stripe products, prices, customer portal, webhook | `terraform/stripe.tf` | Terraform Apply workflow |
| The running image | `flexwall-repo/flexwall:<sha>` | CI, on a release |
| Stripe secret key (versions of `outflex-stripe-secret-key`) | Secret Manager | By hand, never Terraform |
| Connector keys and apps (Steam, Twitch, TikTok, Instagram, Enable Banking) | `connector_secrets` in `terraform/cloud_run.tf`, from the `TF_VAR_CONNECTOR_SECRETS` repository secret (a JSON object by env name) | Terraform Apply workflow |

Everything runs in the GCP project `ghota-outflex-prod`, `europe-west1`, with
state in `gs://micro-sass-478507-tfstate/terraform/flexwall`. The project hosted
the previous flexwall.lol app: its id, `outflex-sa` and
`outflex-stripe-secret-key` keep their names because renaming them would cost
the project, a Workspace authorization or the live key.

## Releasing

1. Merge pull requests into `main` with [Conventional Commit](https://www.conventionalcommits.org) titles.
2. Release Please keeps a release pull request open with the next version and changelog.
3. Merging it tags `vX.Y.Z` and dispatches CI, which tests, builds the image, deploys it and checks that `/`, `/explore`, `/pricing` and a rendered image answer 200.

A manual run of the CI workflow deploys `main` without a release.

CI deploys the image only. Environment variables, secret references and
scaling come from Terraform, so never pass `--set-env-vars` or
`--update-env-vars` to `gcloud run deploy`: the next apply would undo them, or
they would drop the secrets.

## Changing infrastructure

1. Change `terraform/` in a pull request. Terraform Validate checks format and validity.
2. After merge, run **Terraform Plan**, read it, then run **Terraform Apply**.

Both run as `terraform-foundation@micro-sass-478507` through Workload Identity
Federation, with the `production` environment.

Secrets Terraform generates, and what replacing them costs:

| Secret | Replacing it |
|---|---|
| `flexwall-secret` | Signs everyone out and breaks installed lock screen links. |
| `flexwall-encryption-key` | Makes every stored connector credential unreadable. `prevent_destroy` guards it. |
| `flexwall-stripe-webhook-secret` | Follows the webhook endpoint; harmless. |

## Domain

`flexwall.lol` and `www.flexwall.lol` map to the service when
`enable_domain_mapping` is true, and `app_url` (sign-in links, Stripe
redirects, the webhook, the portal) follows. Turned off, the app answers on its
run.app URL. A domain maps to one service at a time; a new mapping takes up to
an hour to get its certificate.

## Email

Sign-in links are sent through the Gmail API as `villers@ghotatechsolutions.com`.
The service signs as `outflex-sa` (`google_service_account.mail_signer`), the
account Workspace authorizes for domain-wide delegation (`gmail.send`, client id
in the `mail_signer_client_id` output); `flexwall-sa` holds Token Creator on it.

## Stripe settings outside Terraform

The provider can't manage these; they were set in the dashboard of the Flexwall
account (`acct_1U7NFI601gQlsn4H`) on 2026-09-14. Keep them in step with the
legal pages.

| Where | Setting |
|---|---|
| Settings > Business > Public details | Website `https://flexwall.lol`, support email `contact@ghotatechsolutions.com`, support URL `/legal`, privacy `/privacy`, terms `/terms` |
| Settings > Billing > Subscriptions and emails | Emails for upcoming renewals (45 days before, as the terms promise), expiring cards and failed card payments; subscription management link `https://flexwall.lol/settings` |
| Settings > Business > Customer emails | Receipts for successful payments and refunds |
| Settings > Billing > Invoices | Footer with the publisher's legal mentions and VAT number; line prices shown tax included |
| Tax | Not collecting yet: a registration must be added (France, and the EU One-Stop Shop if it applies) |

Two Terraform variables wait on those settings, because Stripe refuses every
checkout session while they are on and the account isn't ready:

- `stripe_collect_terms_consent`: needs the terms URL in public details (done).
- `stripe_automatic_tax`: needs Stripe Tax active with a registration.

The pricing page's own consent box is always on and recorded with each payment.
