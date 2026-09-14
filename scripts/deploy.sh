#!/bin/bash
# Build, push and deploy the flexwall image to Cloud Run.
# Configuration lives on the service (env vars and secret references): this
# script only ships a new image. Never --set-env-vars: it would drop secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-ghota-outflex-prod}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-flexwall}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/outflex-repo/${SERVICE}"
TAG=$(date +%Y%m%d-%H%M%S)
APP_URL="${APP_URL:-https://flexwall.lol}"

echo "[deploy] building ${REGISTRY}:${TAG}"
# linux/amd64: Apple Silicon builds arm64 images, which Cloud Run refuses.
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_APP_URL="${APP_URL}" -t "${REGISTRY}:${TAG}" "$ROOT"
docker push "${REGISTRY}:${TAG}"
gcloud run deploy "${SERVICE}" --image "${REGISTRY}:${TAG}" --region "${REGION}" --project "${PROJECT_ID}" \
  --platform managed --allow-unauthenticated --update-env-vars "RELEASE=${TAG}"
echo "[deploy] done"
