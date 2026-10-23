#!/usr/bin/env bash
# Run in Google Cloud Shell as a project IAM administrator. Creates no keys.
set -euo pipefail

# Supply identifiers for YOUR deployment; no account credentials belong here.
readonly cc_project="${CC_PROJECT_ID:?Set your Firebase project ID}"
readonly cc_number="${CC_PROJECT_NUMBER:?Set your numeric Google Cloud project number}"
readonly cc_team="${CC_VERCEL_TEAM_SLUG:?Set your Vercel team slug}"
readonly cc_team_id="${CC_VERCEL_TEAM_ID:?Set your Vercel team ID}"
readonly cc_app="${CC_VERCEL_PROJECT_NAME:?Set your Vercel project name}"
readonly cc_app_id="${CC_VERCEL_PROJECT_ID:?Set your Vercel project ID}"
readonly cc_pool='chotcong'
readonly cc_provider='vercel'
readonly cc_account='chotcong-vercel'
[[ "$cc_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ && "$cc_number" =~ ^[0-9]+$ ]] || { echo 'Invalid project identifiers.' >&2; exit 1; }
[[ "$cc_team" =~ ^[a-z0-9-]+$ && "$cc_app" =~ ^[a-z0-9-]+$ && "$cc_team_id" =~ ^team_[A-Za-z0-9]+$ && "$cc_app_id" =~ ^prj_[A-Za-z0-9]+$ ]] || { echo 'Invalid Vercel identifiers.' >&2; exit 1; }
readonly cc_email="${cc_account}@${cc_project}.iam.gserviceaccount.com"
readonly cc_subject="owner:${cc_team}:project:${cc_app}:environment:production"
readonly cc_issuer="https://oidc.vercel.com/${cc_team}"
readonly cc_audience="https://vercel.com/${cc_team}"
readonly cc_condition="assertion.owner_id == '${cc_team_id}' && assertion.project_id == '${cc_app_id}' && assertion.environment == 'production' && assertion.sub == '${cc_subject}'"

print_config() {
  cat <<EOF
FIREBASE_ADMIN_AUTH_MODE=vercel-oidc
GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${cc_number}/locations/global/workloadIdentityPools/${cc_pool}/providers/${cc_provider}
GCP_SERVICE_ACCOUNT_EMAIL=${cc_email}
EOF
}
if [[ "${1:-}" == '--print-config' ]]; then
  print_config
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'Usage: bash setup-vercel-wif.sh [--print-config]' >&2
  exit 1
fi
[[ "${CC_CONFIRM_PROJECT:-}" == "$cc_project" ]] || { echo 'Set CC_CONFIRM_PROJECT to the exact target project ID after reviewing IAM changes.' >&2; exit 1; }
command -v gcloud >/dev/null || { echo 'Run this script in Google Cloud Shell.' >&2; exit 1; }
cc_actual_number="$(gcloud projects describe "$cc_project" --format='value(projectNumber)')"
[[ "$cc_actual_number" == "$cc_number" ]] || { echo 'Unexpected project number. Stopping.' >&2; exit 1; }

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$cc_project" --quiet

if ! gcloud iam workload-identity-pools describe "$cc_pool" --location=global --project="$cc_project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$cc_pool" --location=global --project="$cc_project" --display-name='Chot Cong Vercel Production' --quiet
fi

cc_metadata="$(mktemp)"
trap 'rm -f "$cc_metadata"' EXIT
if gcloud iam workload-identity-pools providers describe "$cc_provider" --workload-identity-pool="$cc_pool" --location=global --project="$cc_project" --format=json >"$cc_metadata" 2>/dev/null; then
  # Never overwrite an existing provider with a different trust configuration.
  python3 - "$cc_metadata" "$cc_issuer" "$cc_audience" "$cc_condition" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    provider = json.load(f)
expected = (provider.get('oidc', {}).get('issuerUri') == sys.argv[2]
    and provider.get('oidc', {}).get('allowedAudiences') == [sys.argv[3]]
    and provider.get('attributeMapping', {}).get('google.subject') == 'assertion.sub'
    and provider.get('attributeCondition') == sys.argv[4]
    and provider.get('state') == 'ACTIVE')
if not expected:
    sys.exit('Existing provider differs or is inactive. Review it before continuing; no trust policy was overwritten.')
PY
else
  gcloud iam workload-identity-pools providers create-oidc "$cc_provider" \
    --workload-identity-pool="$cc_pool" --location=global --project="$cc_project" \
    --issuer-uri="$cc_issuer" --allowed-audiences="$cc_audience" \
    --attribute-mapping='google.subject=assertion.sub' \
    --attribute-condition="$cc_condition" --quiet
fi

if ! gcloud iam service-accounts describe "$cc_email" --project="$cc_project" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$cc_account" --project="$cc_project" --display-name='Chot Cong Vercel backend' --quiet
fi
for cc_role in roles/datastore.user roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$cc_project" --member="serviceAccount:${cc_email}" --role="$cc_role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$cc_email" \
  --project="$cc_project" --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/${cc_number}/locations/global/workloadIdentityPools/${cc_pool}/subject/${cc_subject}" \
  --condition=None --quiet >/dev/null

echo 'Workload Identity configured. No service-account key was created.'
echo 'Send these non-secret configuration values to the deployment operator:'
print_config
echo 'Firestore database, Rules/indexes, Google provider and authorized domains still need separate verification.'
