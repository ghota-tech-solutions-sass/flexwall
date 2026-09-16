# =============================================================================
# VARIABLES
# =============================================================================

variable "project_id" {
  description = "GCP project hosting flexwall.lol."
  type        = string
  default     = "ghota-outflex-prod"
}

variable "billing_account" {
  description = "Billing account of the project."
  type        = string
  default     = "01C21A-FDDA7A-9A3CE7"
}

variable "folder_id" {
  description = "Resource Manager folder of the project."
  type        = string
  default     = "folders/559527833921"
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
  description = "Serve var.domain (and www) from this service. While false, the app runs on its run.app URL. A domain maps to one service at a time: delete any other mapping of it first."
  type        = bool
  default     = true
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

variable "moderation_inbox" {
  description = "Where wall reports are sent."
  type        = string
  default     = "villers@ghotatechsolutions.com"
}

# =============================================================================
# STRIPE
# =============================================================================

variable "stripe_automatic_tax" {
  description = "Compute VAT with Stripe Tax at checkout. Turn on only once Stripe Tax is active on the account with its registrations (dashboard > Tax): before that, Stripe refuses every checkout session."
  type        = bool
  default     = false
}

variable "stripe_collect_terms_consent" {
  description = "Show Stripe's terms checkbox at checkout, on top of the one on the pricing page. Turn on only once a terms URL is set in the account's public details (dashboard > Settings > Public details): before that, Stripe refuses every checkout session."
  type        = bool
  default     = false
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

variable "admin_emails" {
  description = "Accounts that can open the back office at /admin: list accounts, offer Pro, moderate walls. Empty turns the back office off."
  type        = list(string)
  default     = ["villers@ghotatechsolutions.com"]
}

variable "price_paid_account_cents" {
  description = "Monthly price of one connected bank or brokerage account in US cents, taxes included. Must match PAID_ACCOUNT_PRICE_USD in apps/web/src/domain/pricing.ts."
  type        = number
  default     = 500
}

variable "connector_secrets" {
  description = "Server keys and app credentials for connectors, by env name (STEAM_API_KEY, TWITCH_CLIENT_ID, …). Each non-empty value becomes a Secret Manager secret read by the service. Empty or missing names leave that connector saying the server isn't set up."
  type        = map(string)
  sensitive   = true
  default     = {}

  validation {
    condition = alltrue([for name in keys(var.connector_secrets) : contains([
      "STEAM_API_KEY",
      "TWITCH_CLIENT_ID",
      "TWITCH_CLIENT_SECRET",
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_CLIENT_SECRET",
      "INSTAGRAM_APP_ID",
      "INSTAGRAM_APP_SECRET",
      "ENABLE_BANKING_APP_ID",
      "ENABLE_BANKING_PRIVATE_KEY",
      "SNAPTRADE_CLIENT_ID",
      "SNAPTRADE_CONSUMER_KEY",
      "PLAID_CLIENT_ID",
      "PLAID_SECRET",
      "PLAID_ENV",
      "SNAPTRADE_ENV",
      "ENABLE_BANKING_ENV",
      "TIKTOK_ENV",
      "INSTAGRAM_ENV",
      "POWENS_DOMAIN",
      "POWENS_CLIENT_ID",
      "POWENS_CLIENT_SECRET",
      "POWENS_ENV",
      "X_BEARER_TOKEN",
    ], name)])
    error_message = "connector_secrets only takes the names in CONNECTOR_ENV (apps/web/src/composition.ts) that Terraform doesn't already manage."
  }
}

variable "github_token" {
  description = "Optional GitHub token with no scopes: raises the API limit for stars and followers from 60 to 5000 calls an hour. Empty leaves it unset."
  type        = string
  sensitive   = true
  default     = ""
}
