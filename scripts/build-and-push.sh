#!/bin/bash
set -euo pipefail

# =============================================================================
# Build & Push Docker images to AWS Public ECR
# =============================================================================
# Usage:
#   ./scripts/build-and-push.sh              # Build and push all images
#   ./scripts/build-and-push.sh backend      # Build and push only backend
#   ./scripts/build-and-push.sh portal-wallet # Build and push only portal-wallet
#
# Environment variables (set these or export before running):
#   AWS_ACCESS_KEY_ID       - AWS access key
#   AWS_SECRET_ACCESS_KEY   - AWS secret key
#   AWS_REGION              - AWS region for ECR public (default: us-east-1)
#   IMAGE_TAG               - Docker image tag (default: 1.0.0)
# =============================================================================

ECR_REGISTRY="public.ecr.aws/smartsensesolutions"
ECR_NAMESPACE="eu-jap-hack"
AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-1.0.0}"

# All application names
ALL_APPS=(
  "backend"
  "portal-dataspace"
  "portal-tata-admin"
  "portal-tata-public"
  "portal-wallet"
  "portal-insurance"
  "portal-company"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[BUILD]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Validate AWS credentials ----
check_aws_credentials() {
  if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    warn "AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not set."
    warn "Set them as environment variables:"
    warn "  export AWS_ACCESS_KEY_ID=AKIA..."
    warn "  export AWS_SECRET_ACCESS_KEY=..."
    error "Cannot authenticate to ECR without AWS credentials."
  fi
}

# ---- ECR Login ----
ecr_login() {
  log "Logging in to AWS Public ECR..."
  aws ecr-public get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
  log "ECR login successful."
}

# ---- Build image ----
build_image() {
  local app_name="$1"
  local full_image="${ECR_REGISTRY}/${ECR_NAMESPACE}/${app_name}:${IMAGE_TAG}"

  log "Building ${full_image} ..."

  if [ "$app_name" = "backend" ]; then
    docker build \
      -t "${full_image}" \
      -f backend/Dockerfile \
      .
  else
    docker build \
      --build-arg APP_NAME="${app_name}" \
      -t "${full_image}" \
      -f apps/Dockerfile \
      .
  fi

  log "Built ${full_image}"
}

# ---- Push image ----
push_image() {
  local app_name="$1"
  local full_image="${ECR_REGISTRY}/${ECR_NAMESPACE}/${app_name}:${IMAGE_TAG}"

  log "Pushing ${full_image} ..."
  docker push "${full_image}"
  log "Pushed ${full_image}"
}

# ---- Main ----
main() {
  # Determine which apps to build
  local apps_to_build=()
  if [ $# -gt 0 ]; then
    apps_to_build=("$@")
  else
    apps_to_build=("${ALL_APPS[@]}")
  fi

  # Validate app names
  for app in "${apps_to_build[@]}"; do
    local valid=false
    for known in "${ALL_APPS[@]}"; do
      if [ "$app" = "$known" ]; then valid=true; break; fi
    done
    if [ "$valid" = false ]; then
      error "Unknown app: ${app}. Valid apps: ${ALL_APPS[*]}"
    fi
  done

  log "============================================"
  log "  ECR Registry : ${ECR_REGISTRY}"
  log "  Namespace    : ${ECR_NAMESPACE}"
  log "  Tag          : ${IMAGE_TAG}"
  log "  Apps         : ${apps_to_build[*]}"
  log "============================================"

  # Check prerequisites
  command -v docker >/dev/null 2>&1 || error "docker is not installed"
  command -v aws >/dev/null 2>&1    || error "aws CLI is not installed"

  # Auth & Login
  check_aws_credentials
  ecr_login

  # Build all
  log "--- BUILDING IMAGES ---"
  for app in "${apps_to_build[@]}"; do
    build_image "$app"
  done

  # Push all
  log "--- PUSHING IMAGES ---"
  for app in "${apps_to_build[@]}"; do
    push_image "$app"
  done

  log "============================================"
  log "  All done! Pushed ${#apps_to_build[@]} image(s)."
  log "============================================"

  # Print summary
  echo ""
  echo "Images pushed:"
  for app in "${apps_to_build[@]}"; do
    echo "  ${ECR_REGISTRY}/${ECR_NAMESPACE}/${app}:${IMAGE_TAG}"
  done
}

main "$@"
