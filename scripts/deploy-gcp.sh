#!/usr/bin/env bash
# Deploy the hosted Foglamp stack to GCP (project foglamp-prod, us-central1).
#
#   scripts/deploy-gcp.sh server     # rebuild + deploy the dashboard API
#   scripts/deploy-gcp.sh ingest     # rebuild + deploy span ingestion
#   scripts/deploy-gcp.sh migrate    # rebuild + run the one-shot migrate job
#   scripts/deploy-gcp.sh all        # server + ingest (run migrate first if
#                                    # the release includes schema changes)
#
# Web (apps/web) is NOT deployed here — Vercel builds it on push to master.
# Cloud SQL and the ClickHouse VM are stateful and managed separately (see the
# notes at the bottom of this file).
set -euo pipefail

PROJECT=foglamp-prod
REGION=us-central1
REPO="${REGION}-docker.pkg.dev/${PROJECT}/foglamp"
cd "$(dirname "$0")/.."

build_push() {
  local target=$1
  docker build --platform linux/amd64 --target "$target" -t "${REPO}/${target}:latest" .
  docker push "${REPO}/${target}:latest"
}

deploy_service() {
  local name=$1 target=$2
  # Image-only update: env vars, secrets, scaling, and connectors carry over
  # from the live revision.
  gcloud run deploy "foglamp-${name}" \
    --project "$PROJECT" --region "$REGION" \
    --image "${REPO}/${target}:latest"
}

case "${1:-}" in
  server)
    build_push server
    deploy_service server server
    ;;
  ingest)
    build_push ingest
    deploy_service ingest ingest
    ;;
  migrate)
    build_push migrate
    gcloud run jobs update foglamp-migrate \
      --project "$PROJECT" --region "$REGION" \
      --image "${REPO}/migrate:latest"
    gcloud run jobs execute foglamp-migrate \
      --project "$PROJECT" --region "$REGION" --wait
    ;;
  all)
    build_push server
    build_push ingest
    deploy_service server server
    deploy_service ingest ingest
    ;;
  *)
    echo "usage: $0 {server|ingest|migrate|all}" >&2
    exit 1
    ;;
esac

# Stateful pieces (not touched by this script):
#  - Postgres: Cloud SQL instance foglamp-pg — Google patches it during the
#    maintenance window; schema changes ship via `migrate`.
#  - ClickHouse: GCE VM foglamp-clickhouse pinned to clickhouse-server:24.8.
#    To upgrade:  gcloud compute instances update-container foglamp-clickhouse \
#      --zone us-central1-a --container-image clickhouse/clickhouse-server:<ver>-alpine
#    Data lives on the VM disk (daily snapshots, 14-day retention).
