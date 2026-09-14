# =============================================================================
# FIRESTORE
# =============================================================================
#
# The only database: users, walls, connections, cached values and daily
# snapshots, in fw_ collections. It predates the platform, hence the import.
#
# =============================================================================

import {
  to = google_firestore_database.default
  id = "projects/${var.project_id}/databases/(default)"
}

resource "google_firestore_database" "default" {
  project                           = var.project_id
  name                              = "(default)"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "OPTIMISTIC"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}
