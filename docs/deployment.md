# Deploying flexwall.lol

How the hosted service is built, released and configured. To run Flexwall on
your own host, see [self-hosting.md](self-hosting.md).

## Pieces

| What | Where | Changed by |
|---|---|---|
| Cloud Run service `flexwall`, secrets, Artifact Registry, IAM, YouTube key | `terraform/` | Terraform Apply workflow |
| Stripe products, prices, customer portal, webhook | `terraform/stripe.tf` | Terraform Apply workflow |
| The running image | `flexwall-repo/flexwall:<sha>` | CI, on a release |
| Stripe secret key | Secret Manager `outflex-stripe-secret-key` | By hand, never Terraform |

Everything runs in the GCP project `ghota-outflex-prod`, `europe-west1`. The
project and its Firestore database predate the platform and belong to the
`terraform/outflex` state; this configuration reads them. Terraform state is in
`gs://micro-sass-478507-tfstate/terraform/flexwall`.

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

## Moving flexwall.lol to this service

Until then the service answers on its run.app URL and `app_url` follows it
(sign-in links, Stripe redirects, the webhook). A domain maps to one service at
a time, and the current mappings belong to the `terraform/outflex` state:

```bash
# 1. In the outflex repository: stop managing and delete the old mappings
terraform -chdir=terraform state rm 'google_cloud_run_domain_mapping.domain[0]' 'google_cloud_run_domain_mapping.www[0]'
gcloud beta run domain-mappings delete --domain flexwall.lol --region europe-west1 --project ghota-outflex-prod
gcloud beta run domain-mappings delete --domain www.flexwall.lol --region europe-west1 --project ghota-outflex-prod

# 2. Here: set enable_domain_mapping = true (variables.tf), merge, apply
```

The apply creates both mappings, points `app_url`, the Stripe webhook and the
portal return URL at `https://flexwall.lol`. DNS stays as it is (the domain
already resolves to Cloud Run); the certificate takes up to an hour, during
which the domain doesn't serve HTTPS. Then set the repository variable
`NEXT_PUBLIC_APP_URL` (or leave the default) and release.

## Email

Sign-in links are sent through the Gmail API as `villers@ghotatechsolutions.com`.
The service signs as `outflex-sa`, which is already authorized for
domain-wide delegation (`gmail.send`); `flexwall-sa` holds Token Creator on it.
To sign as `flexwall-sa` instead, authorize the `service_account_client_id`
output in the Workspace admin console, then set `email_signer_account_id = ""`.
