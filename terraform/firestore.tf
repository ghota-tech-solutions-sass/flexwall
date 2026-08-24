# ── Firestore (native) : la seule base du produit ──
# Une collection "entries", un doc par handle, incrément transactionnel
# pour les top-ups. Regional, serverless, zéro maintenance.

resource "google_firestore_database" "default" {
  project                           = var.project_id
  name                              = "(default)"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "OPTIMISTIC"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"

  depends_on = [google_project_service.apis]
}
