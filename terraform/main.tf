# =============================================================================
# FLEXWALL - TERRAFORM CONFIGURATION
# =============================================================================
#
# The Flexwall platform on Cloud Run: the project, its Firestore database, the
# service, secrets, Stripe billing and the flexwall.lol domain.
#
# The project hosted the previous flexwall.lol app, hence its id and a few
# resource names (ghota-outflex-prod, outflex-sa, outflex-stripe-secret-key).
# Those are kept, not renamed: renaming a project is impossible, and renaming
# the others would cost a Workspace authorization or the live Stripe key.
#
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    stripe = {
      source  = "lukasaron/stripe"
      version = "~> 3.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Same state bucket as the other projects of the platform.
  backend "gcs" {
    bucket = "micro-sass-478507-tfstate"
    prefix = "terraform/flexwall"
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.bootstrap_project_id
}

provider "google" {
  alias                 = "bootstrap"
  project               = var.bootstrap_project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.bootstrap_project_id
}

# =============================================================================
# PROJECT
# =============================================================================

import {
  to = google_project.app
  id = var.project_id
}

resource "google_project" "app" {
  provider = google.bootstrap

  project_id      = var.project_id
  name            = "Flexwall Production"
  billing_account = var.billing_account
  folder_id       = trimprefix(var.folder_id, "folders/")

  labels = {
    managed_by  = "terraform"
    platform    = "ghota"
    application = "flexwall"
    environment = "production"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# =============================================================================
# ENABLE REQUIRED APIs
# =============================================================================

locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    # Sign-in links and reports through the Gmail API (email.tf)
    "iamcredentials.googleapis.com",
    "gmail.googleapis.com",
    # The server's YouTube Data API key (youtube.tf)
    "apikeys.googleapis.com",
    "youtube.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
