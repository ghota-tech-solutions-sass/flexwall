# =============================================================================
# YOUTUBE DATA API KEY
# =============================================================================
#
# YouTube tiles read public channel statistics with the server's key, so owners
# only type a channel. The key can call nothing but the YouTube Data API.
#
# =============================================================================

resource "google_apikeys_key" "youtube" {
  name         = "flexwall-youtube"
  display_name = "Flexwall YouTube Data API"
  project      = var.project_id

  restrictions {
    api_targets {
      service = "youtube.googleapis.com"
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "youtube_api_key" {
  secret_id = "flexwall-youtube-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "youtube_api_key" {
  secret      = google_secret_manager_secret.youtube_api_key.id
  secret_data = google_apikeys_key.youtube.key_string
}
