# =============================================================================
# EMAIL THROUGH GOOGLE WORKSPACE (Gmail API)
# =============================================================================
#
# Sign-in links leave from a Workspace mailbox. No key file: the service signs
# a JWT through the IAM Credentials API as the signer account and exchanges it
# for a Gmail token acting as var.email_impersonate (domain-wide delegation).
#
# Delegation is authorized per service account in the Workspace admin console
# (Security > API controls > Domain-wide delegation, scope
# https://www.googleapis.com/auth/gmail.send), a step Terraform can't do.
# outflex-sa (client id 112934306338490526160) has it, so the app signs as that
# account. Replacing it means authorizing the new one first.
#
# =============================================================================

import {
  to = google_service_account.mail_signer
  id = "projects/${var.project_id}/serviceAccounts/outflex-sa@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_service_account" "mail_signer" {
  account_id   = "outflex-sa"
  display_name = "Flexwall mail signer"
  description  = "Signs Gmail tokens for sign-in links. Authorized for domain-wide delegation (gmail.send) in Workspace; runs nothing."
  project      = var.project_id

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  email_enabled = var.email_impersonate != ""
  email_signer  = google_service_account.mail_signer.email

  email_env = local.email_enabled ? merge(
    {
      EMAIL_IMPERSONATE     = var.email_impersonate
      EMAIL_SERVICE_ACCOUNT = local.email_signer
    },
    var.email_from == "" ? {} : { EMAIL_FROM = var.email_from },
  ) : {}
}

# The app's account may sign JWTs as the signer.
resource "google_service_account_iam_member" "email_signer" {
  count              = local.email_enabled ? 1 : 0
  service_account_id = google_service_account.mail_signer.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.flexwall.email}"
}

output "mail_signer_client_id" {
  value       = google_service_account.mail_signer.unique_id
  description = "Client id authorized for gmail.send in Workspace."
}
