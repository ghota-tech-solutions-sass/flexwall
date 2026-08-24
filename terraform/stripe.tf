# ── Stripe : le webhook est de l'infra, donc du Terraform ──
#
# Le endpoint pointe sur l'URL publique de l'app (local.app_url — même
# logique que lettrio : une seule source de vérité pour l'origine).
# Le secret de signature est exposé en attribut par le provider puis
# versé dans Secret Manager par cloud_run.tf.

resource "stripe_webhook_endpoint" "wall" {
  url = "${local.app_url}/api/webhooks/stripe"

  enabled_events = [
    "checkout.session.completed",
  ]

  description = "outflex — credit handles on paid checkout"
}
