#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — idempotent cluster bringup for jap-eu-hack-2026
#
# Usage:
#   ./helm/bootstrap.sh <env> [step]
#     env:  dev | qa | prod
#     step: prereq | infra | vault-init | vault-unseal | vault-populate
#           | argocd-login | app-of-apps | verify | all   (default: all)
#
# Idempotent: safe to re-run; each step short-circuits if already done.
# =============================================================================
set -euo pipefail

ENV="${1:-}"
STEP="${2:-all}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/helm/bootstrap/.env.${ENV}"
MAPPING_FILE="${REPO_ROOT}/helm/bootstrap/vault-mapping.yaml"
INFRA_NS="infra"
APPS_NS="apps"
VAULT_NS="${INFRA_NS}"      # vault deployed into infra namespace
ARGO_NS="argocd"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">>> $*"; }

case "$ENV" in
  dev|qa|prod) ;;
  *) die "Usage: $0 <dev|qa|prod> [step]" ;;
esac

ensure_ns() {
  local ns="$1"
  kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
}

# ----- prereq -----
step_prereq() {
  info "Checking prereqs..."
  command -v kubectl >/dev/null || die "kubectl not installed"
  command -v helm >/dev/null    || die "helm not installed"
  command -v yq >/dev/null      || die "yq not installed (mikefarah/yq v4+)"
  command -v jq >/dev/null      || die "jq not installed"
  kubectl cluster-info >/dev/null || die "kubectl can't reach cluster"
  [ -f "$ENV_FILE" ] || die "$ENV_FILE missing — copy from .env.example and fill"
  for d in /data/postgres /data/vault /data/waltid /data/backups /data/local-path; do
    [ -d "$d" ] || info "WARN: $d missing — run: sudo mkdir -p $d && sudo chown 1000:1000 $d"
  done
  info "prereq OK"
}

# ----- infra -----
step_infra() {
  info "Installing infra-chart..."
  helm dep update "${REPO_ROOT}/helm/infra-chart"
  helm upgrade --install infra "${REPO_ROOT}/helm/infra-chart" \
    --namespace "${INFRA_NS}" --create-namespace \
    -f "${REPO_ROOT}/helm/infra-chart/values.yaml" \
    -f "${REPO_ROOT}/helm/infra-chart/values-${ENV}.yaml" \
    --wait --timeout 10m
  info "infra installed."
}

# ----- vault-init -----
step_vault_init() {
  info "Vault init check..."
  local status initialized
  status=$(kubectl -n "${VAULT_NS}" exec vault-0 -- vault status -format=json 2>/dev/null || echo '{}')
  initialized=$(echo "$status" | jq -r '.initialized // false')
  if [ "$initialized" = "true" ]; then
    info "Vault already initialized."
    return 0
  fi
  info "Running vault operator init..."
  local init_file="${REPO_ROOT}/helm/bootstrap/.vault-init-${ENV}.json"
  kubectl -n "${VAULT_NS}" exec vault-0 -- \
    vault operator init -format=json -key-shares=5 -key-threshold=3 > "$init_file"
  chmod 600 "$init_file"
  info "Vault init captured → ${init_file} (gitignored — keep offline backup!)"

  # Build unseal-keys Secret; keys are base64-encoded already in unseal_keys_b64.
  local keys_json="$TMPDIR/keys.json"
  jq '{
    unseal_key_1: .unseal_keys_b64[0],
    unseal_key_2: .unseal_keys_b64[1],
    unseal_key_3: .unseal_keys_b64[2]
  }' "$init_file" > "$keys_json"
  kubectl -n "${VAULT_NS}" create secret generic vault-unseal-keys \
    --from-file=keys.json="$keys_json" \
    --dry-run=client -o yaml | kubectl apply -f -

  # Store root token Secret (convenience for the populate step; rotate after onboarding).
  local root_token
  root_token=$(jq -r '.root_token' "$init_file")
  kubectl -n "${VAULT_NS}" create secret generic vault-root-token \
    --from-literal=token="$root_token" \
    --dry-run=client -o yaml | kubectl apply -f -
  info "vault-unseal-keys + vault-root-token Secrets applied."
}

# ----- vault-unseal -----
step_vault_unseal() {
  info "Triggering vault-unseal Job via helm upgrade hook..."
  kubectl -n "${VAULT_NS}" delete job vault-unseal --ignore-not-found
  helm upgrade --install infra "${REPO_ROOT}/helm/infra-chart" \
    --namespace "${INFRA_NS}" \
    -f "${REPO_ROOT}/helm/infra-chart/values.yaml" \
    -f "${REPO_ROOT}/helm/infra-chart/values-${ENV}.yaml" \
    --reuse-values --wait --timeout 5m
  if ! kubectl -n "${VAULT_NS}" exec vault-0 -- vault status | grep -q 'Sealed.*false'; then
    die "Vault still sealed after unseal Job"
  fi
  info "Vault unsealed."
}

# ----- vault-populate -----
step_vault_populate() {
  info "Populating Vault KV from ${ENV_FILE}..."
  # ENV_FILE is a runtime path; SC1090 cannot statically follow it.
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a

  local token
  token=$(kubectl -n "${VAULT_NS}" get secret vault-root-token -o jsonpath='{.data.token}' | base64 -d)

  local count
  count=$(yq '.mappings | length' "$MAPPING_FILE")
  for i in $(seq 0 $((count-1))); do
    local env_key path key val
    env_key=$(yq ".mappings[$i].envKey" "$MAPPING_FILE")
    path=$(yq ".mappings[$i].vaultPath" "$MAPPING_FILE")
    key=$(yq ".mappings[$i].vaultKey" "$MAPPING_FILE")
    val="${!env_key:-}"
    [ -n "$val" ] || { info "SKIP: $env_key empty in .env.${ENV}"; continue; }
    kubectl -n "${VAULT_NS}" exec vault-0 -- env VAULT_TOKEN="$token" \
      vault kv put "$path" "$key=$val" >/dev/null
    info "Set $path/$key"
  done

  # Create apps namespace (idempotent).
  ensure_ns "${APPS_NS}"

  # Per-app Vault tokens.
  # MVP: reuse root token (simplest path to working backend). Production should
  # replace this with Kubernetes auth method + per-app AppRoles or short-lived
  # tokens. Tracked as an explicit follow-up in docs/devops/vault-bootstrap.md.
  local vault_addr="http://vault.${VAULT_NS}.svc.cluster.local:8200"
  for app in backend provisioning; do
    kubectl -n "${APPS_NS}" create secret generic "${app}-vault-token" \
      --from-literal=VAULT_TOKEN="$token" \
      --from-literal=VAULT_ADDR="$vault_addr" \
      --dry-run=client -o yaml | kubectl apply -f -
  done

  # Materialise Postgres creds Secret consumed by StatefulSet + pg-dump CronJob
  # + backend (via envFrom on <fullname>-postgres-creds).
  # NOTE: the StatefulSet's envFrom resolves the Secret name
  # "<Release.Name>-app-chart-postgres-creds". We create it under the release
  # name "app" matching the default app-of-apps release.
  local postgres_secret="app-app-chart-postgres-creds"
  kubectl -n "${APPS_NS}" create secret generic "${postgres_secret}" \
    --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    --from-literal=POSTGRES_BACKEND_PASSWORD="${POSTGRES_BACKEND_PASSWORD}" \
    --from-literal=POSTGRES_KEYCLOAK_PASSWORD="${POSTGRES_KEYCLOAK_PASSWORD}" \
    --from-literal=POSTGRES_WALTID_WALLET_PASSWORD="${POSTGRES_WALTID_WALLET_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -

  # Keycloak admin Secret (consumed by keycloak-deployment via secretKeyRef).
  kubectl -n "${APPS_NS}" create secret generic keycloak-admin \
    --from-literal=password="${KEYCLOAK_ADMIN_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -

  info "Vault populated + app Secrets materialised."
}

# ----- argocd-login -----
step_argocd_login() {
  info "Argo CD initial admin password:"
  kubectl -n "${ARGO_NS}" get secret argocd-initial-admin-secret \
    -o jsonpath='{.data.password}' | base64 -d
  echo ""
  info "UI: https://argocd.${ENV}.dataspace.smartsenselabs.com  (user: admin)"
}

# ----- app-of-apps -----
step_app_of_apps() {
  info "Applying app-of-apps for ${ENV}..."
  kubectl apply -f "${REPO_ROOT}/gitops/bootstrap/app-of-apps-${ENV}.yaml"
  info "Argo will reconcile gitops/envs/${ENV}/"
}

# ----- verify -----
step_verify() {
  info "Waiting (up to 15m) for all Applications to be Healthy + Synced..."
  local deadline=$((SECONDS + 900))
  while [ $SECONDS -lt $deadline ]; do
    local unhealthy
    unhealthy=$(kubectl -n "${ARGO_NS}" get applications -o json 2>/dev/null \
      | jq -r '.items[] | select(.status.health.status != "Healthy" or .status.sync.status != "Synced") | .metadata.name' \
      || true)
    if [ -z "$unhealthy" ]; then
      info "All Applications Healthy + Synced."
      return 0
    fi
    info "Waiting on: $(echo "$unhealthy" | tr '\n' ' ')"
    sleep 20
  done
  die "Timeout waiting for Applications to converge"
}

# ----- dispatch -----
case "$STEP" in
  prereq)         step_prereq ;;
  infra)          step_prereq; step_infra ;;
  vault-init)     step_vault_init ;;
  vault-unseal)   step_vault_unseal ;;
  vault-populate) step_vault_populate ;;
  argocd-login)   step_argocd_login ;;
  app-of-apps)    step_app_of_apps ;;
  verify)         step_verify ;;
  all)
    step_prereq
    step_infra
    step_vault_init
    step_vault_unseal
    step_vault_populate
    step_argocd_login
    step_app_of_apps
    step_verify
    ;;
  *) die "Unknown step: $STEP" ;;
esac
