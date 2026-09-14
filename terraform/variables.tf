# =============================================================================
# VARIABLES
# =============================================================================

variable "project_id" {
  description = "GCP project hosting flexwall.lol."
  type        = string
  default     = "ghota-outflex-prod"
}

variable "bootstrap_project_id" {
  description = "Shared infra project used as billing/quota project and state host."
  type        = string
  default     = "micro-sass-478507"
}

variable "region" {
  description = "Region for Cloud Run and Artifact Registry. Firestore already lives here."
  type        = string
  default     = "europe-west1"
}

# =============================================================================
# DOMAIN
# =============================================================================

variable "domain" {
  description = "Public domain of the app."
  type        = string
  default     = "flexwall.lol"
}

variable "enable_domain_mapping" {
  description = "Serve var.domain (and www) from this service. While false, the app runs on its run.app URL and flexwall.lol keeps pointing at the previous service. Before turning it on, remove the previous mappings from the terraform/outflex state and delete them: a domain maps to one service at a time."
  type        = bool
  default     = false
}

# =============================================================================
# CLOUD RUN
# =============================================================================

variable "cloud_run_memory" {
  description = "Memory per instance. Share cards and lock screens render fonts and SVG in memory."
  type        = string
  default     = "1Gi"
}

variable "cloud_run_max_instances" {
  description = "Instance ceiling."
  type        = number
  default     = 5
}

# =============================================================================
# EMAIL
# =============================================================================

variable "email_impersonate" {
  description = "Google Workspace mailbox the Gmail sender acts as. Empty prints sign-in links in the server log instead: nobody can sign in."
  type        = string
  default     = "villers@ghotatechsolutions.com"
}

variable "email_from" {
  description = "Visible From header. Must be email_impersonate or one of its aliases."
  type        = string
  default     = "flexwall.lol <villers@ghotatechsolutions.com>"
}

variable "email_signer_account_id" {
  description = "Service account whose domain-wide delegation signs Gmail tokens. outflex-sa is already authorized for gmail.send in Workspace, so the app signs as it rather than waiting on a new authorization. Empty signs as the app's own account, which then needs its own authorization (output service_account_client_id)."
  type        = string
  default     = "outflex-sa"
}

variable "moderation_inbox" {
  description = "Where wall reports are sent."
  type        = string
  default     = "villers@ghotatechsolutions.com"
}

# =============================================================================
# STRIPE
# =============================================================================

variable "stripe_secret_key_secret_id" {
  description = "Secret Manager secret holding the Stripe secret key. It is written by hand, never by Terraform, so the key never sits in tfvars, CI secrets or state inputs: Terraform reads it to configure the provider and the service reads it at startup."
  type        = string
  default     = "outflex-stripe-secret-key"
}

variable "price_monthly_cents" {
  description = "Pro, monthly, in US cents."
  type        = number
  default     = 600
}

variable "price_yearly_cents" {
  description = "Pro, yearly, in US cents."
  type        = number
  default     = 4800
}

variable "price_lifetime_cents" {
  description = "Lifetime, one payment, in US cents."
  type        = number
  default     = 9900
}

# =============================================================================
# CONNECTORS
# =============================================================================

variable "github_token" {
  description = "Optional GitHub token with no scopes: raises the API limit for stars and followers from 60 to 5000 calls an hour. Empty leaves it unset."
  type        = string
  sensitive   = true
  default     = ""
}
