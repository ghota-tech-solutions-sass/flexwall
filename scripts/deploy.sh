#!/usr/bin/env bash
#
# Deploys the current commit to Cloud Run without GitHub Actions.
#
# The CI workflow does the same three things (build the image, push it to
# Artifact Registry, point the service at it) and stays the normal path. This
# script is for when there are no runner minutes left, or when a deploy has to
# happen from a laptop.
#
# The build runs in Cloud Build when it can: the service runs on amd64, and
# emulating that on an Apple Silicon machine takes an order of magnitude longer.
# When Cloud Build refuses — its service account currently can't read the source
# it was just handed — the script builds the amd64 image locally instead, which
# is slow but needs no permission anyone has to grant first.
#
# Environment variables, secrets and scaling belong to Terraform. This only
# changes which image the service runs.
#
# Usage:
#   scripts/deploy.sh            # deploy the current commit
#   scripts/deploy.sh --dry-run  # print what it would do
#
set -euo pipefail

PROJECT_ID="ghota-outflex-prod"
REGION="europe-west1"
REPO_NAME="flexwall-repo"
SERVICE_NAME="flexwall"
IMAGE_NAME="flexwall"
DRY_RUN=""
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="yes"

cd "$(dirname "$0")/.."

SHA="$(git rev-parse HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${SHA}"

# A deploy must be traceable to something that exists on the remote.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree isn't clean: commit or stash first, so the running image matches a commit." >&2
  exit 1
fi
if ! git merge-base --is-ancestor "$SHA" "origin/main" 2>/dev/null; then
  echo "HEAD ($(git rev-parse --short HEAD)) isn't on origin/main. Push and merge it first." >&2
  exit 1
fi

echo "Deploying $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
echo "  image:   ${IMAGE}"
echo "  service: ${SERVICE_NAME} (${PROJECT_ID}, ${REGION})"
if [[ -n "$DRY_RUN" ]]; then
  echo "Dry run: nothing was built or deployed."
  exit 0
fi

echo "==> Building in Cloud Build (a few minutes)"
# The Dockerfile defaults NEXT_PUBLIC_APP_URL to the production origin, so the
# image needs no build arguments.
if ! gcloud builds submit --project "$PROJECT_ID" --tag "$IMAGE" --quiet; then
  echo "==> Cloud Build refused; building amd64 locally instead (longer)"
  command -v docker >/dev/null || { echo "Local build needs Docker, which isn't on this machine." >&2; exit 1; }
  # --push rather than a build then a push: buildx writes the manifest straight
  # to Artifact Registry, and a cross-platform image doesn't have to be loaded
  # into the local daemon to be pushed.
  docker buildx build --platform linux/amd64 --tag "$IMAGE" --push .
fi

echo "==> Pointing the service at it"
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet

URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "==> Smoke test ${URL}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL")"
[[ "$CODE" == "200" ]] || { echo "The service answered HTTP ${CODE}." >&2; exit 1; }
echo "Deployed: ${URL} answers 200, running ${SHA:0:7}."
