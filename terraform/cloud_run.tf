# =============================================================================
# SERVICE ACCOUNT
# =============================================================================

resource "google_service_account" "flexwall" {
  account_id   = "flexwall-sa"
  display_name = "Flexwall Cloud Run Service Account"
  project      = var.project_id

  depends_on = [google_project_service.apis]
}

# Walls, users and connections live in Firestore under fw_ collections.
resource "google_project_iam_member" "flexwall_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.flexwall.email}"
}

resource "google_project_iam_member" "flexwall_ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.flexwall.email}"
}

# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================

resource "google_artifact_registry_repository" "flexwall" {
  project       = var.project_id
  location      = var.region
  repository_id = "flexwall-repo"
  format        = "DOCKER"
  description   = "Flexwall Docker images"

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.apis]
}

# =============================================================================
# SECRETS
# =============================================================================

# Signs sessions, sign-in links and lock screen links. Replacing it signs
# everyone out and breaks every lock screen link already installed.
resource "random_password" "flexwall_secret" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "flexwall_secret" {
  secret_id = "flexwall-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "flexwall_secret" {
  secret      = google_secret_manager_secret.flexwall_secret.id
  secret_data = random_password.flexwall_secret.result
}

# Encrypts connector credentials at rest: exactly 32 bytes, base64. Replacing
# it makes every stored credential unreadable and every owner reconnects, hence
# prevent_destroy.
resource "random_bytes" "encryption_key" {
  length = 32

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "encryption_key" {
  secret_id = "flexwall-encryption-key"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "encryption_key" {
  secret      = google_secret_manager_secret.encryption_key.id
  secret_data = random_bytes.encryption_key.base64

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # Whether a token was given is not a secret; the token is.
  github_token_set = nonsensitive(var.github_token != "")
}

resource "google_secret_manager_secret" "github_token" {
  count     = local.github_token_set ? 1 : 0
  secret_id = "flexwall-github-token"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "github_token" {
  count       = local.github_token_set ? 1 : 0
  secret      = google_secret_manager_secret.github_token[0].id
  secret_data = var.github_token
}

locals {
  # Every secret the service reads, by env name. Access is granted from this
  # list so a new secret can't be wired without its IAM binding.
  secret_env = merge(
    {
      FLEXWALL_SECRET         = google_secret_manager_secret.flexwall_secret.secret_id
      FLEXWALL_ENCRYPTION_KEY = google_secret_manager_secret.encryption_key.secret_id
      STRIPE_SECRET_KEY       = google_secret_manager_secret.stripe_secret_key.secret_id
      STRIPE_WEBHOOK_SECRET   = google_secret_manager_secret.stripe_webhook_secret.secret_id
      YOUTUBE_API_KEY         = google_secret_manager_secret.youtube_api_key.secret_id
    },
    local.github_token_set ? { GITHUB_TOKEN = google_secret_manager_secret.github_token[0].secret_id } : {}
  )

  # Cloud Run reads "latest" at revision start: a new version must roll a new
  # revision, so their numbers go into a template annotation.
  secret_versions = sha256(join("-", concat(
    [
      google_secret_manager_secret_version.flexwall_secret.version,
      google_secret_manager_secret_version.encryption_key.version,
      google_secret_manager_secret_version.stripe_webhook_secret.version,
      google_secret_manager_secret_version.youtube_api_key.version,
    ],
    google_secret_manager_secret_version.github_token[*].version,
  )))
}

resource "google_secret_manager_secret_iam_member" "flexwall_access" {
  for_each  = local.secret_env
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.flexwall.email}"
}

# =============================================================================
# CLOUD RUN SERVICE
# =============================================================================

locals {
  # Single source of truth for the public origin: links in mail, Stripe
  # redirects, the webhook endpoint.
  app_url = var.enable_domain_mapping ? "https://${var.domain}" : "https://flexwall-${google_project.app.number}.${var.region}.run.app"

  plain_env = merge(
    {
      NODE_ENV                    = "production"
      NEXT_PUBLIC_APP_URL         = local.app_url
      GOOGLE_PROJECT_ID           = var.project_id
      MODERATION_INBOX            = var.moderation_inbox
      STRIPE_PRICE_MONTHLY        = stripe_price.monthly.id
      STRIPE_PRICE_YEARLY         = stripe_price.yearly.id
      STRIPE_PRICE_LIFETIME       = stripe_price.lifetime.id
      STRIPE_PORTAL_CONFIGURATION = stripe_portal_configuration.billing.id
    },
    local.email_env,
  )
}

resource "google_cloud_run_v2_service" "flexwall" {
  name                = "flexwall"
  location            = var.region
  project             = var.project_id
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  # Public without an allUsers binding, which the organization's domain
  # restricted sharing policy refuses.
  invoker_iam_disabled = true

  template {
    service_account = google_service_account.flexwall.email

    annotations = {
      "secrets-version" = local.secret_versions
    }

    scaling {
      min_instance_count = 0
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      # Placeholder until CI deploys the app: the image is CI's, not Terraform's.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.cloud_run_memory
        }
        # Billed per request: CPU only while a request is in flight.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        tcp_socket {
          port = 3000
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.flexwall_access,
    google_project_iam_member.flexwall_datastore_user,
  ]
}

# =============================================================================
# DOMAIN MAPPING
# =============================================================================

resource "google_cloud_run_domain_mapping" "domain" {
  for_each = var.enable_domain_mapping ? toset([var.domain, "www.${var.domain}"]) : toset([])
  location = var.region
  name     = each.value

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.flexwall.name
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "service_url" {
  value       = google_cloud_run_v2_service.flexwall.uri
  description = "Cloud Run URL of the service."
}

output "app_url" {
  value       = local.app_url
  description = "Public origin the app is configured with."
}

output "image_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.flexwall.repository_id}"
  description = "Where CI pushes images."
}

output "domain_mapping_records" {
  value       = { for name, mapping in google_cloud_run_domain_mapping.domain : name => mapping.status[0].resource_records }
  description = "DNS records for the registrar once the domain is mapped here."
}
