# ── Email via Google Workspace (Gmail API), same mechanism as kitten-clash ──
#
# Magic links (/me) and the welcome mail after payment leave from the owner's
# Workspace mailbox. No key file: the Cloud Run service account signs a JWT for
# itself (IAM Credentials API) and exchanges it for a Gmail token acting as
# var.email_impersonate (domain-wide delegation).
#
# One manual step Terraform cannot do: in the Workspace admin console
# (Security → API controls → Domain-wide delegation), authorize the service
# account's client id with the single scope
#   https://www.googleapis.com/auth/gmail.send
# The client id is output below (service_account_client_id).

locals {
  email_enabled = var.email_impersonate != ""
}

resource "google_service_account_iam_member" "outflex_token_creator" {
  count = local.email_enabled ? 1 : 0

  service_account_id = google_service_account.outflex.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.outflex.email}"
}

output "service_account_client_id" {
  value       = google_service_account.outflex.unique_id
  description = "Client id to authorize for gmail.send in the Workspace admin console."
}
