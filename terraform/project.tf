locals {
  project_folder_id = trimprefix(var.folder_id, "folders/")

  project_labels = merge(
    {
      managed_by  = "terraform"
      platform    = "ghota"
      application = "outflex"
      environment = "production"
    },
    var.project_labels
  )
}

resource "google_project" "app" {
  provider = google.bootstrap

  project_id      = var.project_id
  name            = var.project_name
  billing_account = var.billing_account
  folder_id       = local.project_folder_id
  labels          = local.project_labels

  lifecycle {
    prevent_destroy = true
  }
}

# Project number — used to build the default run.app URL (single source of
# truth for the public origin, same pattern as lettrio).
data "google_project" "project" {
  provider   = google.bootstrap
  project_id = var.project_id

  depends_on = [google_project.app]
}
