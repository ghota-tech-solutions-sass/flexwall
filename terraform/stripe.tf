# =============================================================================
# STRIPE: FLEXWALL'S OWN BILLING
# =============================================================================
#
# Products, prices and the webhook are infrastructure. The secret key is not a
# Terraform input: it is read from Secret Manager, where it is set by hand.
#
#   Pro       $6 a month or $48 a year   subscription
#   Lifetime  $99 once                   payment
#   Credits   100 $3.99 or 400 $11.99, once each   payment
#
# Prices include taxes (tax_behavior inclusive): with Stripe Tax on, the VAT of
# the buyer's country comes out of the price instead of being added to it.
#
# Price ids reach the app as STRIPE_PRICE_*. Changing an amount creates a new
# price (Stripe prices are immutable); existing subscribers keep theirs.
#
# =============================================================================

# The container is Terraform's; its versions are written by hand. Cloud Run and
# the provider below read the latest one.
locals {
  stripe_secret_key_id = "outflex-stripe-secret-key"
}

import {
  to = google_secret_manager_secret.stripe_secret_key
  id = "projects/${var.project_id}/secrets/${local.stripe_secret_key_id}"
}

resource "google_secret_manager_secret" "stripe_secret_key" {
  secret_id = local.stripe_secret_key_id
  project   = var.project_id

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

# By id, not through the resource: the provider needs the key while planning,
# before any change to the container is applied.
data "google_secret_manager_secret_version" "stripe_secret_key" {
  project = var.project_id
  secret  = local.stripe_secret_key_id
}

provider "stripe" {
  api_key = data.google_secret_manager_secret_version.stripe_secret_key.secret_data
}

locals {
  # Electronically supplied services: the EU VAT category of a SaaS sold to consumers.
  stripe_tax_code = "txcd_10000000"
}

resource "stripe_product" "pro" {
  name        = "Flexwall Pro"
  description = "Unlimited tiles, every connector, no watermark, your lock screen and share card."
  tax_code    = local.stripe_tax_code

  metadata = {
    app     = "flexwall"
    plan    = "pro"
    managed = "terraform"
  }
}

resource "stripe_product" "lifetime" {
  name        = "Flexwall Lifetime"
  description = "Everything in Pro, paid once."
  tax_code    = local.stripe_tax_code

  metadata = {
    app     = "flexwall"
    plan    = "lifetime"
    managed = "terraform"
  }
}

resource "stripe_price" "monthly" {
  product      = stripe_product.pro.id
  currency     = "usd"
  unit_amount  = var.price_monthly_cents
  nickname     = "Pro monthly"
  tax_behavior = "inclusive"

  recurring {
    interval       = "month"
    interval_count = 1
  }

  metadata = {
    app     = "flexwall"
    plan    = "monthly"
    managed = "terraform"
  }
}

resource "stripe_price" "yearly" {
  product      = stripe_product.pro.id
  currency     = "usd"
  unit_amount  = var.price_yearly_cents
  nickname     = "Pro yearly"
  tax_behavior = "inclusive"

  recurring {
    interval       = "year"
    interval_count = 1
  }

  metadata = {
    app     = "flexwall"
    plan    = "yearly"
    managed = "terraform"
  }
}

resource "stripe_price" "lifetime" {
  product      = stripe_product.lifetime.id
  currency     = "usd"
  unit_amount  = var.price_lifetime_cents
  nickname     = "Lifetime"
  tax_behavior = "inclusive"

  metadata = {
    app     = "flexwall"
    plan    = "lifetime"
    managed = "terraform"
  }
}

# One credit keeps one metered connection (X without a developer app) fresh for
# a UTC day. Packs are one-off payments; the app adds the credits on
# checkout.session.completed.
resource "stripe_product" "credits" {
  name        = "Flexwall credits"
  description = "Credits for connectors Flexwall reads with its own paid key, such as X. One credit per account per day."
  tax_code    = local.stripe_tax_code

  metadata = {
    app     = "flexwall"
    kind    = "credits"
    managed = "terraform"
  }
}

locals {
  credit_packs = {
    starter = { credits = 100, cents = var.credits_starter_cents }
    regular = { credits = 400, cents = var.credits_regular_cents }
  }
}

resource "stripe_price" "credits" {
  for_each = local.credit_packs

  product      = stripe_product.credits.id
  currency     = "usd"
  unit_amount  = each.value.cents
  nickname     = "${each.value.credits} credits"
  tax_behavior = "inclusive"

  metadata = {
    app     = "flexwall"
    kind    = "credits"
    pack    = each.key
    credits = tostring(each.value.credits)
    managed = "terraform"
  }
}

# =============================================================================
# REFERRALS
# =============================================================================

# An invitee's first payment, on any plan, is 20% off. The app applies it at
# checkout while the invitee's referral hasn't converted.
resource "stripe_coupon" "referral" {
  name        = "Invited to Flexwall: 20% off"
  percent_off = 20
  duration    = "once"

  metadata = {
    app     = "flexwall"
    purpose = "referral"
    managed = "terraform"
  }
}

# =============================================================================
# CUSTOMER PORTAL
# =============================================================================

# "Manage billing" in settings opens this portal. Stripe refuses portal
# sessions in live mode until a configuration exists.
resource "stripe_portal_configuration" "billing" {
  default_return_url = "${local.app_url}/settings"

  business_profile {
    headline             = "Flexwall billing"
    privacy_policy_url   = "${local.app_url}/privacy"
    terms_of_service_url = "${local.app_url}/terms"
  }

  features {
    invoice_history {
      enabled = true
    }

    payment_method_update {
      enabled = true
    }

    customer_update {
      enabled         = true
      allowed_updates = ["email", "address", "tax_id"]
    }

    # Cancelling keeps Pro until the end of the paid period.
    subscription_cancel {
      enabled            = true
      mode               = "at_period_end"
      proration_behavior = "none"

      # Why people leave, asked once at cancellation.
      cancellation_reason {
        enabled = true
        options = ["too_expensive", "missing_features", "switched_service", "unused", "other"]
      }
    }

    # Monthly and yearly are the same product: switching is a price change.
    subscription_update {
      enabled                 = true
      default_allowed_updates = ["price"]
      proration_behavior      = "create_prorations"

      products {
        product = stripe_product.pro.id
        prices  = [stripe_price.monthly.id, stripe_price.yearly.id]
      }
    }
  }

  metadata = {
    app     = "flexwall"
    managed = "terraform"
  }
}

# =============================================================================
# WEBHOOK
# =============================================================================

resource "stripe_webhook_endpoint" "billing" {
  url         = "${local.app_url}/api/webhooks/stripe"
  description = "Flexwall billing: lifetime and credit payments, subscription changes"

  enabled_events = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    # A refund soon after an invitee's first payment takes back the referrer's month.
    "charge.refunded",
  ]

  metadata = {
    app     = "flexwall"
    managed = "terraform"
  }
}

# Stripe generates the signing secret when the endpoint is created; Terraform
# hands it to the service through Secret Manager.
resource "google_secret_manager_secret" "stripe_webhook_secret" {
  secret_id = "flexwall-stripe-webhook-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "stripe_webhook_secret" {
  secret      = google_secret_manager_secret.stripe_webhook_secret.id
  secret_data = stripe_webhook_endpoint.billing.secret
}

output "stripe_prices" {
  value = {
    monthly  = stripe_price.monthly.id
    yearly   = stripe_price.yearly.id
    lifetime = stripe_price.lifetime.id
    credits  = { for pack, price in stripe_price.credits : pack => price.id }
  }
  description = "Price ids the app sells."
}

output "stripe_webhook_url" {
  value = stripe_webhook_endpoint.billing.url
}
