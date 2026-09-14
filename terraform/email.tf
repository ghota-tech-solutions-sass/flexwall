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
# https://www.googleapis.com/auth/gmail.send), a step Terraform can't do. The
# app signs as var.email_signer_account_id, which already has it.
#
# =============================================================================

locals {
  email_enabled = var.email_impersonate != ""
  email_signer  = var.email_signer_account_id != "" ? "${var.email_signer_account_id}@${var.project_id}.iam.gserviceaccount.com" : google_service_account.flexwall.email

  email_env = local.email_enabled ? merge(
    {
      EMAIL_IMPERSONATE     = var.email_impersonate
      EMAIL_SERVICE_ACCOUNT = local.email_signer
    },
    var.email_from == "" ? {} : { EMAIL_FROM = var.email_from },
  ) : {}
}

# The app's account may sign JWTs as the signer (itself, or the authorized one).
resource "google_service_account_iam_member" "email_signer" {
  count              = local.email_enabled ? 1 : 0
  service_account_id = "projects/${var.project_id}/serviceAccounts/${local.email_signer}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.flexwall.email}"
}

output "service_account_client_id" {
  value       = google_service_account.flexwall.unique_id
  description = "Client id to authorize for gmail.send in Workspace, only needed if email_signer_account_id is emptied."
}
