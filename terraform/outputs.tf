output "project_id" {
  value = google_project.app.project_id
}

output "service_url" {
  description = "Public URL of the wall."
  value       = local.app_url
}

output "image_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.outflex.repository_id}"
}

output "stripe_webhook_url" {
  value = stripe_webhook_endpoint.wall.url
}

output "stripe_webhook_secret_ref" {
  description = "Secret Manager resource holding the Stripe signing secret."
  value       = google_secret_manager_secret.stripe_webhook_secret.secret_id
}
