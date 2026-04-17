#!/usr/bin/env bash
# =============================================================================
# validate-helm.sh — local CI equivalent. Run before pushing.
#
# Runs: helm dep update + helm lint + helm template + kubeconform for every
# env, plus actionlint on GHA workflows and shellcheck on shell scripts.
#
# Note: plan specified `kubeval`; we use its actively-maintained successor
# `kubeconform` (drop-in, same flags for our usage).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

KUBECONFORM_FLAGS=(
  -strict
  -ignore-missing-schemas
  -schema-location default
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
)

for chart in infra-chart app-chart; do
  echo ">>> helm dep update $chart"
  helm dep update "helm/$chart" >/dev/null
  for env in dev qa prod; do
    echo ">>> lint $chart @ $env"
    helm lint "helm/$chart" \
      -f "helm/$chart/values.yaml" \
      -f "helm/$chart/values-${env}.yaml"

    echo ">>> template $chart @ $env"
    helm template ci "helm/$chart" \
      -f "helm/$chart/values.yaml" \
      -f "helm/$chart/values-${env}.yaml" \
      --set global.envPrefix="${env}" > "/tmp/${chart}-${env}.yaml"

    echo ">>> kubeconform ${chart}-${env}.yaml"
    kubeconform "${KUBECONFORM_FLAGS[@]}" "/tmp/${chart}-${env}.yaml"
  done
done

echo ">>> kubeconform gitops manifests"
kubeconform "${KUBECONFORM_FLAGS[@]}" gitops/bootstrap/*.yaml gitops/envs/*/*.yaml

echo ">>> actionlint"
actionlint .github/workflows/*.yml

echo ">>> shellcheck"
shellcheck helm/bootstrap.sh scripts/validate-helm.sh

echo "ALL CHECKS PASSED"
