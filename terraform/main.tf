terraform {
  required_version = ">= 1.0"

  # Same state bucket as the other projects of the platform.
  backend "gcs" {
    bucket = "micro-sass-478507-tfstate"
    prefix = "terraform/outflex"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    stripe = {
      source  = "lukasaron/stripe"
      version = "~> 3.4"
    }
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

provider "stripe" {
  api_key = var.stripe_secret_key
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    # Magic links / welcome mail through the Gmail API (email.tf)
    "iamcredentials.googleapis.com",
    "gmail.googleapis.com",
  ])
  project            = google_project.app.project_id
  service            = each.value
  disable_on_destroy = false

  depends_on = [google_project.app]
}
