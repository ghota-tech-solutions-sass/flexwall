#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ──
PROJECT_ID="ghota-outflex-prod"
REGION="europe-west1"
REPO_NAME="outflex-repo"
IMAGE_NAME="outflex"
SERVICE_NAME="outflex"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# ── Colors ──
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[deploy]${NC} $1"; }
ok() { echo -e "${GREEN}[deploy]${NC} $1"; }

cd "$SCRIPT_DIR"

# ── Commands ──
case "${1:-help}" in
  build)
    log "Building Docker image..."
    docker build -t "${REGISTRY}:${TIMESTAMP}" -f "$PROJECT_ROOT/Dockerfile" "$PROJECT_ROOT"
    ok "Build complete: ${REGISTRY}:${TIMESTAMP}"
    ;;

  push)
    log "Pushing image to Artifact Registry..."
    docker push "${REGISTRY}:${TIMESTAMP}"
    ok "Push complete"
    ;;

  deploy)
    # Build, push et deploy dans le même appel : le tag est horodaté à
    # l'invocation, donc "deploy" seul pointait vers une image jamais poussée.
    log "Building ${REGISTRY}:${TIMESTAMP}..."
    docker build -t "${REGISTRY}:${TIMESTAMP}" -f "$PROJECT_ROOT/Dockerfile" "$PROJECT_ROOT"
    log "Pushing..."
    docker push "${REGISTRY}:${TIMESTAMP}"
    log "Deploying ${SERVICE_NAME} to Cloud Run..."
    # --update-env-vars, jamais --set-env-vars : le service tient ses clés
    # Stripe et son secret de session par référence de secret, et --set les
    # remplacerait toutes (paiements et sessions morts au déploiement suivant).
    gcloud run deploy "${SERVICE_NAME}" \
      --image "${REGISTRY}:${TIMESTAMP}" \
      --region "${REGION}" \
      --project "${PROJECT_ID}" \
      --platform managed \
      --allow-unauthenticated \
      --update-env-vars "TIMESTAMP=${TIMESTAMP}"
    ok "Deploy complete"
    ;;

  init)
    terraform init
    ok "Terraform initialized"
    ;;

  plan)
    terraform plan
    ;;

  apply)
    terraform apply
    ;;

  destroy)
    terraform destroy
    ;;

  help|*)
    echo "Usage: $0 {build|push|deploy|init|plan|apply|destroy}"
    echo ""
    echo "  build     - Build Docker image"
    echo "  push      - Push to Artifact Registry"
    echo "  deploy    - Build + Push + Deploy to Cloud Run"
    echo "  init      - terraform init"
    echo "  plan      - terraform plan"
    echo "  apply     - terraform apply"
    echo "  destroy   - terraform destroy"
    ;;
esac
