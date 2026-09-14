#!/bin/bash
# Build, push and deploy the flexwall image by hand. CI does the same on every
# release (.github/workflows/ci.yml); use this only when CI can't.
#
# Terraform owns the service's configuration (env vars, secret references,
# scaling): this script only ships a new image. No --set-env-vars, no
# --update-env-vars, no --allow-unauthenticated (the service is public through
# invoker_iam_disabled; an allUsers binding is refused by the organization).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-ghota-outflex-prod}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-flexwall}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/flexwall-repo/${SERVICE}"
TAG="${TAG:-$(git -C "$ROOT" rev-parse HEAD)}"
APP_URL="${APP_URL:-https://flexwall.lol}"

echo "[deploy] building ${REGISTRY}:${TAG}"
# linux/amd64: Apple Silicon builds arm64 images, which Cloud Run refuses.
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_APP_URL="${APP_URL}" -t "${REGISTRY}:${TAG}" "$ROOT"
docker push "${REGISTRY}:${TAG}"
gcloud run deploy "${SERVICE}" --image "${REGISTRY}:${TAG}" --region "${REGION}" --project "${PROJECT_ID}" --quiet
echo "[deploy] done"
