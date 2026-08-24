#!/bin/bash
# One-shot release: enable Gmail sending, build + deploy the new image with the
# email env vars, wipe the test documents in Firestore, then verify.
# Run from the repo root:   bash scripts/release-email.sh
set -euo pipefail

P=ghota-outflex-prod
REGION=europe-west1
SA="outflex-sa@${P}.iam.gserviceaccount.com"
IMG="${REGION}-docker.pkg.dev/${P}/outflex-repo/outflex"
TAG=$(date +%Y%m%d-%H%M%S)
EMAIL_IMPERSONATE="villers@ghotatechsolutions.com"
EMAIL_FROM="flexwall.lol <villers@ghotatechsolutions.com>"

step() { printf '\n\033[0;34m[release]\033[0m %s\n' "$1"; }

step "1/5 enable Gmail + IAM Credentials APIs"
gcloud services enable gmail.googleapis.com iamcredentials.googleapis.com --project "$P"

step "2/5 let the service account sign JWTs as itself (Gmail impersonation)"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$P" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null

step "3/5 build image on Cloud Build (.gcloudignore keeps .tmp/.env out)"
gcloud builds submit --project "$P" --region "$REGION" --tag "${IMG}:${TAG}" . --quiet
gcloud artifacts docker tags add "${IMG}:${TAG}" "${IMG}:latest" --quiet

step "4/5 deploy with email env vars"
gcloud run deploy outflex --project "$P" --region "$REGION" --image "${IMG}:${TAG}" \
  --update-env-vars "EMAIL_IMPERSONATE=${EMAIL_IMPERSONATE},EMAIL_FROM=${EMAIL_FROM}" --quiet

step "5/5 wipe test documents in Firestore (entries + events)"
TOKEN=$(gcloud auth print-access-token)
B="https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents"
for c in entries events; do
  for doc in $(curl -s -H "Authorization: Bearer $TOKEN" "${B}/${c}?pageSize=300" | python3 -c 'import sys,json; [print(d["name"]) for d in json.load(sys.stdin).get("documents",[])]'); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN" "https://firestore.googleapis.com/v1/${doc}")
    echo "  DELETE ${doc##*/documents/} -> ${code}"
  done
done

step "verify"
echo -n "  entries left: "; curl -s https://flexwall.lol/api/board | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["entries"]))'
echo -n "  env: "; gcloud run services describe outflex --project "$P" --region "$REGION" --format="value(spec.template.spec.containers[0].env)" | tr ';' '\n' | grep -c EMAIL_ | sed 's/$/ EMAIL_ vars/'
echo -n "  magic-link endpoint: "; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{"email":"nobody@example.com"}' https://flexwall.lol/api/me
echo "  (200 = email channel live; 503 = EMAIL_IMPERSONATE missing)"
