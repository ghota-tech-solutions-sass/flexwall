# =============================================================================
# FLEXWALL - TERRAFORM CONFIGURATION
# =============================================================================
#
# The Flexwall platform on Cloud Run, in the project that already hosts
# flexwall.lol. That project, its Firestore database and the flexwall.lol
# domain mappings belong to the previous app (state prefix terraform/outflex):
# this configuration reads them, it doesn't own them. The domain moves here
# with enable_domain_mapping, see cloud_run.tf.
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

# =============================================================================
# PROJECT (read, not owned)
# =============================================================================

data "google_project" "app" {
  project_id = var.project_id
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
