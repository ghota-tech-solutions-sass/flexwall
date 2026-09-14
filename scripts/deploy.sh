#!/bin/bash
# Build, push and deploy flexwall to Cloud Run. gcloud only: never terraform
# in this project (the old leaderboard's state has drifted, see outflex).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="ghota-outflex-prod"
REGION="europe-west1"
REPO_NAME="outflex-repo"
SERVICE_NAME="flexwall"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
APP_URL="${APP_URL:-https://flexwall.lol}"

log() { echo -e "\033[0;34m[deploy]\033[0m $1"; }

# --platform linux/amd64: an Apple Silicon build is arm64, which Cloud Run refuses.
log "Building ${REGISTRY}:${TIMESTAMP} for ${APP_URL}"
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_APP_URL="${APP_URL}" -t "${REGISTRY}:${TIMESTAMP}" "$PROJECT_ROOT"
log "Pushing..."
docker push "${REGISTRY}:${TIMESTAMP}"
log "Deploying ${SERVICE_NAME}..."
# --update-env-vars, never --set-env-vars: secrets are mounted by reference
# and --set would drop them all.
gcloud run deploy "${SERVICE_NAME}" \
  --image "${REGISTRY}:${TIMESTAMP}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --update-env-vars "TIMESTAMP=${TIMESTAMP}"
log "Done"
