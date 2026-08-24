variable "project_id" {
  description = "GCP project id for the outflex production project."
  type        = string
}

variable "project_name" {
  description = "Human name of the GCP project."
  type        = string
  default     = "Outflex Production"
}

variable "billing_account" {
  description = "Billing account id the project is attached to."
  type        = string
}

variable "folder_id" {
  description = "Folder the project is created in (folders/XXXX or raw id)."
  type        = string
}

variable "bootstrap_project_id" {
  description = "Shared infra project used as billing/quota project and TF state host."
  type        = string
  default     = "micro-sass-478507"
}

variable "region" {
  description = "GCP region for Cloud Run, Artifact Registry and Firestore."
  type        = string
  default     = "europe-west1"
}

variable "domain" {
  description = "Custom domain. Empty = default run.app URL."
  type        = string
  default     = ""
}

variable "enable_domain_mapping" {
  description = "Create a Cloud Run domain mapping for var.domain (DNS must point at the service first)."
  type        = bool
  default     = false
}

variable "stripe_secret_key" {
  description = "Stripe secret key (sk_test_… or sk_live_…). Stored in Secret Manager."
  type        = string
  sensitive   = true
}

variable "min_entry_usd" {
  description = "Anti-broke gate: minimum entry amount in USD."
  type        = number
  default     = 1000
}

variable "project_labels" {
  description = "Extra labels merged onto the project."
  type        = map(string)
  default     = {}
}

variable "email_impersonate" {
  description = "Google Workspace mailbox the Gmail sender acts as (e.g. villers@ghotatechsolutions.com). Empty disables magic links and welcome mail."
  type        = string
  default     = ""
}

variable "email_from" {
  description = "Visible From header, e.g. \"flexwall.lol <villers@flexwall.lol>\". Must be email_impersonate or one of its aliases. Defaults to email_impersonate."
  type        = string
  default     = ""
}
