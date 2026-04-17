# Self-Managed k8s DevOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the entire jap-eu-hack-2026 stack to self-managed kubeadm clusters (dev/qa/prod, separate servers), no vendor lock-in beyond AWS ECR Public, single-click umbrella install with GitOps-driven multi-env CI/CD.

**Architecture:** Two Helm charts (`infra-chart` for cluster services, `app-chart` for workloads), Argo CD app-of-apps per env (`gitops/envs/{dev,qa,prod}/`), three GitHub Actions workflows (ci/release-build/promote), Vault (prod-mode + file backend + auto-unseal from k8s Secret), HAProxy Ingress hostNetwork, Let's Encrypt HTTP-01 per-host certs, local-path-provisioner for PVs, bootstrap via idempotent `helm/bootstrap.sh`.

**Tech Stack:** Kubernetes (kubeadm single-node), Helm 3, Argo CD, HashiCorp Vault, HAProxy Kubernetes Ingress (haproxytech), cert-manager, local-path-provisioner, Prometheus + Grafana + Loki + Promtail, Postgres 16, GitHub Actions, AWS ECR Public, docker buildx (amd64/arm64).

**Spec reference:** `docs/superpowers/specs/2026-04-17-self-managed-k8s-devops-design.md`

**Scope boundary — what this plan does NOT do:**
- No application code changes (CLAUDE.md invariant).
- No multi-node deployment (values support it; we deploy single-node).
- No HA Postgres/Vault (single replica each).
- No off-site backups.
- No HSM/KMS unseal, no Vault k8s auth method, no secret rotation.

**Phase ordering:**
1. **Phase 1:** `infra-chart` scaffold + subchart deps
2. **Phase 2:** `infra-chart` own templates (issuer, unseal job, argo ingress)
3. **Phase 3:** `app-chart` rename + Postgres + backup + networkpolicy + Vault integration
4. **Phase 4:** Per-env values files (`-dev.yaml` / `-qa.yaml` / `-prod.yaml`) for both charts
5. **Phase 5:** GitOps app-of-apps restructure + Image Updater
6. **Phase 6:** GitHub Actions workflows (ci / release-build / promote)
7. **Phase 7:** `bootstrap.sh` + `.env.<env>.example` + vault-mapping
8. **Phase 8:** `docs/devops/` documentation folder
9. **Phase 9:** Validation — `helm lint`, `helm template`, kubeval, actionlint

**Prerequisites (install on local dev machine before starting):**

```bash
# macOS
brew install helm kubectl kind kubeval shellcheck actionlint yq
# verify
helm version --short         # expect v3.14+
kubectl version --client     # any recent
kind version                 # expect v0.23+ (for smoke-test cluster)
kubeval --version
actionlint -version
```

---

## Phase 1 — `infra-chart` scaffold

### Task 1: Create infra-chart directory and Chart.yaml

**Files:**
- Create: `helm/infra-chart/Chart.yaml`
- Create: `helm/infra-chart/.helmignore`
- Create: `helm/infra-chart/templates/_helpers.tpl`

- [ ] **Step 1: Create chart directory**

Run:
```bash
mkdir -p helm/infra-chart/templates
```

- [ ] **Step 2: Write `helm/infra-chart/Chart.yaml`**

```yaml
apiVersion: v2
name: infra-chart
description: Cluster-level infrastructure (ingress, cert-manager, vault, argocd, storage, monitoring) for jap-eu-hack-2026
type: application
version: 0.1.0
appVersion: "1.0.0"

dependencies:
  - name: kubernetes-ingress
    version: "1.41.4"
    repository: https://haproxytech.github.io/helm-charts
    condition: haproxy.enabled
    alias: haproxy

  - name: cert-manager
    version: "v1.16.2"
    repository: https://charts.jetstack.io
    condition: certManager.enabled

  - name: local-path-provisioner
    version: "0.0.30"
    repository: https://charts.containeroo.ch
    condition: localPath.enabled

  - name: vault
    version: "0.29.1"
    repository: https://helm.releases.hashicorp.com
    condition: vault.enabled

  - name: argo-cd
    version: "7.7.10"
    repository: https://argoproj.github.io/argo-helm
    condition: argocd.enabled

  - name: kube-prometheus-stack
    version: "65.5.1"
    repository: https://prometheus-community.github.io/helm-charts
    condition: monitoring.prom.enabled

  - name: loki
    version: "6.18.0"
    repository: https://grafana.github.io/helm-charts
    condition: monitoring.loki.enabled

  - name: promtail
    version: "6.16.6"
    repository: https://grafana.github.io/helm-charts
    condition: monitoring.promtail.enabled
```

- [ ] **Step 3: Write `helm/infra-chart/.helmignore`**

```
.DS_Store
.git/
.gitignore
.idea/
.vscode/
*.swp
*.bak
*.tmp
*.orig
*.md
```

- [ ] **Step 4: Write `helm/infra-chart/templates/_helpers.tpl`**

```go
{{/*
Build per-env fully-qualified hostname: <subdomain>.<envPrefix>.<domain>
Usage: {{ include "infra-chart.host" (dict "subdomain" "argocd" "ctx" .) }}
*/}}
{{- define "infra-chart.host" -}}
{{- $subdomain := .subdomain -}}
{{- $ctx := .ctx -}}
{{- printf "%s.%s.%s" $subdomain $ctx.Values.global.envPrefix $ctx.Values.global.domain -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "infra-chart.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: jap-eu-hack-2026
app.kubernetes.io/env: {{ .Values.global.envPrefix }}
{{- end -}}
```

- [ ] **Step 5: Validate chart skeleton**

Run:
```bash
helm lint helm/infra-chart/
```
Expected: `1 chart(s) linted, 0 chart(s) failed`.

- [ ] **Step 6: Commit**

```bash
git add helm/infra-chart/
git commit -m "feat(devops): scaffold infra-chart with subchart deps"
```

---

### Task 2: Add infra-chart base values (global + haproxy + cert-manager + local-path)

**Files:**
- Create: `helm/infra-chart/values.yaml`

- [ ] **Step 1: Write `helm/infra-chart/values.yaml`**

```yaml
# =============================================================================
# Global — overridden per env in values-{dev,qa,prod}.yaml
# =============================================================================
global:
  domain: dataspace.smartsenselabs.com
  envPrefix: dev                    # dev | qa | prod
  letsencryptEmail: devops@smartsenselabs.com

# =============================================================================
# HAProxy Kubernetes Ingress Controller (hostNetwork, single-node)
# =============================================================================
haproxy:
  enabled: true
  controller:
    kind: DaemonSet
    ingressClass: haproxy
    ingressClassResource:
      default: false
      name: haproxy
    daemonset:
      useHostNetwork: true
      useHostPort: true
      hostPorts:
        http: 80
        https: 443
        stat: 1024
    service:
      enabled: false               # we use hostNetwork, not a Service LB
    defaultTLSSecret:
      enabled: false

# =============================================================================
# cert-manager + Let's Encrypt HTTP-01 ClusterIssuers
# =============================================================================
certManager:
  enabled: true

cert-manager:
  installCRDs: true
  global:
    leaderElection:
      namespace: cert-manager

issuers:
  letsencryptStaging:
    enabled: true
    email: ""                     # defaults to global.letsencryptEmail
    server: https://acme-staging-v02.api.letsencrypt.org/directory
  letsencryptProd:
    enabled: true
    email: ""
    server: https://acme-v02.api.letsencrypt.org/directory

# =============================================================================
# local-path-provisioner (Rancher)
# =============================================================================
localPath:
  enabled: true
  isDefault: true

local-path-provisioner:
  storageClass:
    defaultClass: true
    name: local-path
  nodePathMap:
    - node: DEFAULT_PATH_FOR_NON_LISTED_NODES
      paths:
        - /data/local-path

# =============================================================================
# HashiCorp Vault (prod-mode, file backend, auto-unseal from k8s Secret)
# =============================================================================
vault:
  enabled: true

vault-subchart: &vault-overrides
  server:
    standalone:
      enabled: true
      config: |
        ui = true
        listener "tcp" {
          address = "0.0.0.0:8200"
          tls_disable = 1
        }
        storage "file" {
          path = "/vault/data"
        }
    dataStorage:
      enabled: true
      size: 5Gi
      storageClass: local-path
      accessMode: ReadWriteOnce
    dev:
      enabled: false
    ingress:
      enabled: false              # internal-only; accessed via port-forward
    resources:
      requests: { cpu: 100m, memory: 256Mi }
      limits:   { cpu: 500m, memory: 512Mi }
  injector:
    enabled: false                # we use direct API from apps, not sidecar injection
  ui:
    enabled: true

# Auto-unseal Job (own template; reads k8s Secret vault-unseal-keys)
vaultUnseal:
  enabled: true
  keysSecretName: vault-unseal-keys
  image: hashicorp/vault:1.17

# =============================================================================
# Argo CD
# =============================================================================
argocd:
  enabled: true

argo-cd:
  global:
    domain: ""                    # built from global.envPrefix in own argocd-ingress.yaml template
  configs:
    params:
      server.insecure: true       # HAProxy terminates TLS
  server:
    service:
      type: ClusterIP
    ingress:
      enabled: false              # own template renders it
    extraArgs:
      - --insecure
  controller:
    replicas: 1
  repoServer:
    replicas: 1
  applicationSet:
    enabled: true
  notifications:
    enabled: false
  dex:
    enabled: false

# Argo CD Image Updater (sidecar model — deployed via own manifest, not subchart)
imageUpdater:
  enabled: true                   # only effective in dev
  image:
    repository: quay.io/argoprojlabs/argocd-image-updater
    tag: v0.15.1
  gitSSHSecretName: argocd-image-updater-ssh

# =============================================================================
# Monitoring: Prometheus + Grafana + Loki + Promtail
# =============================================================================
monitoring:
  prom:
    enabled: true
  loki:
    enabled: true
  promtail:
    enabled: true

kube-prometheus-stack:
  alertmanager:
    enabled: false
  prometheus:
    prometheusSpec:
      retention: 7d
      storageSpec:
        volumeClaimTemplate:
          spec:
            storageClassName: local-path
            resources:
              requests:
                storage: 10Gi
  grafana:
    ingress:
      enabled: false              # own template
    persistence:
      enabled: true
      storageClassName: local-path
      size: 2Gi
    adminPassword: ""              # overridden per env; operator sets via values or Secret
  prometheusOperator:
    enabled: true                  # kept for ServiceMonitor CRDs
  nodeExporter:
    enabled: true
  kubeStateMetrics:
    enabled: true

loki:
  deploymentMode: SingleBinary
  loki:
    auth_enabled: false
    commonConfig:
      replication_factor: 1
    storage:
      type: filesystem
  singleBinary:
    replicas: 1
    persistence:
      enabled: true
      storageClass: local-path
      size: 10Gi
  monitoring:
    lokiCanary:
      enabled: false
    selfMonitoring:
      enabled: false
  test:
    enabled: false

promtail:
  config:
    clients:
      - url: http://infra-loki:3100/loki/api/v1/push
```

- [ ] **Step 2: Pull subchart dependencies**

Run:
```bash
cd helm/infra-chart && helm dep update && cd -
```
Expected: `helm/infra-chart/charts/` populated with 8 `.tgz` files.

- [ ] **Step 3: Add `charts/` to `.gitignore`**

Run:
```bash
echo "helm/infra-chart/charts/" >> .gitignore
echo "helm/infra-chart/Chart.lock" >> .gitignore
```

Rationale: subchart tgz files are reproducible from `Chart.yaml` + `helm dep update`; don't commit them. `Chart.lock` is generated.

- [ ] **Step 4: Lint**

Run:
```bash
helm lint helm/infra-chart/ -f helm/infra-chart/values.yaml
```
Expected: `0 chart(s) failed`.

- [ ] **Step 5: Commit**

```bash
git add helm/infra-chart/values.yaml .gitignore
git commit -m "feat(devops): infra-chart base values (haproxy, cert-manager, local-path, vault, argocd, monitoring)"
```

---

## Phase 2 — `infra-chart` own templates

### Task 3: Add Let's Encrypt ClusterIssuers template

**Files:**
- Create: `helm/infra-chart/templates/letsencrypt-issuer.yaml`

- [ ] **Step 1: Write `helm/infra-chart/templates/letsencrypt-issuer.yaml`**

```yaml
{{- if .Values.certManager.enabled -}}
{{- if .Values.issuers.letsencryptStaging.enabled }}
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
spec:
  acme:
    email: {{ default .Values.global.letsencryptEmail .Values.issuers.letsencryptStaging.email | quote }}
    server: {{ .Values.issuers.letsencryptStaging.server | quote }}
    privateKeySecretRef:
      name: letsencrypt-staging-account
    solvers:
      - http01:
          ingress:
            class: haproxy
{{- end }}
---
{{- if .Values.issuers.letsencryptProd.enabled }}
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
spec:
  acme:
    email: {{ default .Values.global.letsencryptEmail .Values.issuers.letsencryptProd.email | quote }}
    server: {{ .Values.issuers.letsencryptProd.server | quote }}
    privateKeySecretRef:
      name: letsencrypt-prod-account
    solvers:
      - http01:
          ingress:
            class: haproxy
{{- end }}
{{- end }}
```

- [ ] **Step 2: Render dry-run**

Run:
```bash
helm template infra helm/infra-chart/ --show-only templates/letsencrypt-issuer.yaml
```
Expected: two `ClusterIssuer` manifests printed (staging + prod).

- [ ] **Step 3: Commit**

```bash
git add helm/infra-chart/templates/letsencrypt-issuer.yaml
git commit -m "feat(devops): LE staging+prod ClusterIssuers via HTTP-01"
```

---

### Task 4: Add Vault auto-unseal Job template

**Files:**
- Create: `helm/infra-chart/templates/vault-unseal-job.yaml`
- Create: `helm/infra-chart/templates/vault-unseal-rbac.yaml`

- [ ] **Step 1: Write `helm/infra-chart/templates/vault-unseal-rbac.yaml`**

```yaml
{{- if and .Values.vault.enabled .Values.vaultUnseal.enabled }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vault-unseal
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: vault-unseal
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["{{ .Values.vaultUnseal.keysSecretName }}"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: vault-unseal
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
subjects:
  - kind: ServiceAccount
    name: vault-unseal
    namespace: {{ .Release.Namespace }}
roleRef:
  kind: Role
  name: vault-unseal
  apiGroup: rbac.authorization.k8s.io
{{- end }}
```

- [ ] **Step 2: Write `helm/infra-chart/templates/vault-unseal-job.yaml`**

```yaml
{{- if and .Values.vault.enabled .Values.vaultUnseal.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: vault-unseal
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  backoffLimit: 10
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        {{- include "infra-chart.labels" . | nindent 8 }}
    spec:
      serviceAccountName: vault-unseal
      restartPolicy: OnFailure
      containers:
        - name: unseal
          image: {{ .Values.vaultUnseal.image | quote }}
          env:
            - name: VAULT_ADDR
              value: "http://vault.{{ .Release.Namespace }}.svc.cluster.local:8200"
          command:
            - /bin/sh
            - -c
            - |
              set -eu
              echo "Waiting for Vault to be reachable..."
              until vault status >/dev/null 2>&1 || [ $? -eq 2 ]; do
                sleep 2
              done
              SEALED=$(vault status -format=json | awk -F: '/"sealed"/ {gsub(/[ ,]/, ""); print $2; exit}')
              if [ "$SEALED" = "false" ]; then
                echo "Vault already unsealed."
                exit 0
              fi
              if [ ! -f /unseal/keys.json ]; then
                echo "ERROR: no unseal keys mounted. Run bootstrap.sh vault-init first."
                exit 1
              fi
              KEY1=$(sed -n 's/.*"unseal_key_1":"\([^"]*\)".*/\1/p' /unseal/keys.json)
              KEY2=$(sed -n 's/.*"unseal_key_2":"\([^"]*\)".*/\1/p' /unseal/keys.json)
              KEY3=$(sed -n 's/.*"unseal_key_3":"\([^"]*\)".*/\1/p' /unseal/keys.json)
              vault operator unseal "$KEY1"
              vault operator unseal "$KEY2"
              vault operator unseal "$KEY3"
              echo "Vault unsealed."
          volumeMounts:
            - name: unseal-keys
              mountPath: /unseal
              readOnly: true
      volumes:
        - name: unseal-keys
          secret:
            secretName: {{ .Values.vaultUnseal.keysSecretName }}
            optional: true
{{- end }}
```

- [ ] **Step 3: Render dry-run**

Run:
```bash
helm template infra helm/infra-chart/ --show-only templates/vault-unseal-job.yaml
```
Expected: Job manifest with post-install hook + ServiceAccount-scoped access to `vault-unseal-keys` Secret.

- [ ] **Step 4: Commit**

```bash
git add helm/infra-chart/templates/vault-unseal-job.yaml helm/infra-chart/templates/vault-unseal-rbac.yaml
git commit -m "feat(devops): Vault auto-unseal Job via helm post-install hook"
```

---

### Task 5: Add Argo CD Ingress template

**Files:**
- Create: `helm/infra-chart/templates/argocd-ingress.yaml`

- [ ] **Step 1: Write `helm/infra-chart/templates/argocd-ingress.yaml`**

```yaml
{{- if .Values.argocd.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server
  namespace: argocd
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    haproxy.org/ssl-redirect: "true"
spec:
  ingressClassName: haproxy
  tls:
    - hosts:
        - {{ include "infra-chart.host" (dict "subdomain" "argocd" "ctx" .) }}
      secretName: argocd-server-tls
  rules:
    - host: {{ include "infra-chart.host" (dict "subdomain" "argocd" "ctx" .) }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 80
{{- end }}
```

- [ ] **Step 2: Add Grafana Ingress (same file, appended)**

Append to `helm/infra-chart/templates/argocd-ingress.yaml`:

```yaml
---
{{- if .Values.monitoring.prom.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    haproxy.org/ssl-redirect: "true"
spec:
  ingressClassName: haproxy
  tls:
    - hosts:
        - {{ include "infra-chart.host" (dict "subdomain" "grafana" "ctx" .) }}
      secretName: grafana-tls
  rules:
    - host: {{ include "infra-chart.host" (dict "subdomain" "grafana" "ctx" .) }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: infra-grafana
                port:
                  number: 80
{{- end }}
```

- [ ] **Step 3: Rename file to reflect contents**

Run:
```bash
git mv helm/infra-chart/templates/argocd-ingress.yaml helm/infra-chart/templates/ingresses.yaml
```

- [ ] **Step 4: Dry-render both Ingresses**

Run:
```bash
helm template infra helm/infra-chart/ --show-only templates/ingresses.yaml --set global.envPrefix=dev
```
Expected: two Ingress manifests with `argocd.dev.dataspace.smartsenselabs.com` and `grafana.dev.dataspace.smartsenselabs.com` hosts.

- [ ] **Step 5: Commit**

```bash
git add helm/infra-chart/templates/ingresses.yaml
git commit -m "feat(devops): ingresses for argocd and grafana (per-env hosts)"
```

---

### Task 6: Add Argo CD Image Updater manifest

**Files:**
- Create: `helm/infra-chart/templates/image-updater.yaml`

Rationale: The argo-cd subchart doesn't include Image Updater. Deploy as a standalone Deployment + ConfigMap + ServiceAccount. Only runs if `imageUpdater.enabled: true`. Its annotations on individual Argo Applications (set in Phase 5) determine which images it watches.

- [ ] **Step 1: Write `helm/infra-chart/templates/image-updater.yaml`**

```yaml
{{- if and .Values.argocd.enabled .Values.imageUpdater.enabled }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-image-updater
  namespace: argocd
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: argocd-image-updater
  namespace: argocd
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
rules:
  - apiGroups: ["argoproj.io"]
    resources: ["applications"]
    verbs: ["get", "list", "update", "patch"]
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: argocd-image-updater
  namespace: argocd
subjects:
  - kind: ServiceAccount
    name: argocd-image-updater
    namespace: argocd
roleRef:
  kind: Role
  name: argocd-image-updater
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-image-updater-config
  namespace: argocd
data:
  registries.conf: |
    registries:
      - name: ECR Public
        api_url: https://public.ecr.aws
        prefix: public.ecr.aws
        ping: yes
        default: true
  log.level: info
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: argocd-image-updater
  namespace: argocd
  labels:
    {{- include "infra-chart.labels" . | nindent 4 }}
spec:
  replicas: 1
  selector:
    matchLabels: { app.kubernetes.io/name: argocd-image-updater }
  template:
    metadata:
      labels: { app.kubernetes.io/name: argocd-image-updater }
    spec:
      serviceAccountName: argocd-image-updater
      containers:
        - name: argocd-image-updater
          image: {{ .Values.imageUpdater.image.repository }}:{{ .Values.imageUpdater.image.tag }}
          command: [/usr/local/bin/argocd-image-updater, run]
          env:
            - name: ARGOCD_SERVER
              value: argocd-server.argocd.svc.cluster.local
            - name: ARGOCD_INSECURE
              value: "true"
          volumeMounts:
            - name: config
              mountPath: /app/config
            - name: ssh-key
              mountPath: /app/config/ssh
              readOnly: true
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 256Mi }
      volumes:
        - name: config
          configMap: { name: argocd-image-updater-config }
        - name: ssh-key
          secret:
            secretName: {{ .Values.imageUpdater.gitSSHSecretName }}
            optional: true
            defaultMode: 0400
{{- end }}
```

- [ ] **Step 2: Render dry-run**

Run:
```bash
helm template infra helm/infra-chart/ --show-only templates/image-updater.yaml
```
Expected: 5 manifests (ServiceAccount, Role, RoleBinding, ConfigMap, Deployment).

- [ ] **Step 3: Commit**

```bash
git add helm/infra-chart/templates/image-updater.yaml
git commit -m "feat(devops): Argo CD Image Updater deployment (dev-only auto-promotion)"
```

---

## Phase 3 — `app-chart` rename + new templates

### Task 7: Rename `eu-jap-hack` → `app-chart`

**Files:**
- Move: `helm/eu-jap-hack/` → `helm/app-chart/`
- Modify: `helm/app-chart/Chart.yaml`
- Modify: `helm/app-chart/templates/_helpers.tpl` (rename helper names)
- Modify: all templates using `eu-jap-hack.fullname` / `eu-jap-hack.labels` / `eu-jap-hack.image`

- [ ] **Step 1: Move directory**

Run:
```bash
git mv helm/eu-jap-hack helm/app-chart
```

- [ ] **Step 2: Update `helm/app-chart/Chart.yaml`**

```yaml
apiVersion: v2
name: app-chart
description: Application workloads (backend, portals, keycloak, waltid, postgres, provisioning) for jap-eu-hack-2026
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- [ ] **Step 3: Rewrite `helm/app-chart/templates/_helpers.tpl`**

```go
{{/*
Expand the name of the chart.
*/}}
{{- define "app-chart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
*/}}
{{- define "app-chart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "app-chart.labels" -}}
helm.sh/chart: {{ include "app-chart.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: jap-eu-hack-2026
app.kubernetes.io/env: {{ .Values.global.envPrefix | default "dev" }}
{{- end }}

{{/*
Selector labels for a component
*/}}
{{- define "app-chart.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .release }}
{{- end }}

{{/*
Image helper — supports per-chart registry override via global.imageRegistry.
Usage: {{ include "app-chart.image" (dict "global" .Values.global "image" .Values.backend.image) }}
*/}}
{{- define "app-chart.image" -}}
{{- if .image.registry -}}
{{ .image.registry }}/{{ .image.repository }}:{{ .image.tag }}
{{- else if .global.imageRegistry -}}
{{ .global.imageRegistry }}/{{ .image.repository }}:{{ .image.tag }}
{{- else -}}
{{ .image.repository }}:{{ .image.tag }}
{{- end -}}
{{- end }}

{{/*
Host helper — per-env <subdomain>.<envPrefix>.<domain>
Usage: {{ include "app-chart.host" (dict "subdomain" "api" "ctx" .) }}
*/}}
{{- define "app-chart.host" -}}
{{- $subdomain := .subdomain -}}
{{- $ctx := .ctx -}}
{{- printf "%s.%s.%s" $subdomain $ctx.Values.global.envPrefix $ctx.Values.global.domain -}}
{{- end -}}
```

- [ ] **Step 4: Rename helper invocations in all templates**

Run:
```bash
grep -lr "eu-jap-hack\." helm/app-chart/templates/ | xargs sed -i '' 's/eu-jap-hack\./app-chart./g'
```

On Linux (GNU sed), drop the `''`:
```bash
grep -lr "eu-jap-hack\." helm/app-chart/templates/ | xargs sed -i 's/eu-jap-hack\./app-chart./g'
```

- [ ] **Step 5: Verify no leftover references**

Run:
```bash
grep -rn "eu-jap-hack" helm/app-chart/
```
Expected: no matches.

- [ ] **Step 6: Add `global` block to `values.yaml` top**

Prepend to `helm/app-chart/values.yaml` (before existing `global:` if present, or add new):

```yaml
global:
  imageRegistry: public.ecr.aws/smartsense    # placeholder; override per env
  imagePullSecrets: []                        # ECR Public = anonymous pulls
  domain: dataspace.smartsenselabs.com
  envPrefix: dev                              # dev | qa | prod
```

Merge with existing `global:` block (currently has `imageRegistry: ""` and `imagePullSecrets: []`). Replace it with the block above.

- [ ] **Step 7: Lint**

Run:
```bash
helm lint helm/app-chart/
```
Expected: `0 chart(s) failed`.

- [ ] **Step 8: Commit**

```bash
git add helm/app-chart/ .gitignore
git rm -r helm/eu-jap-hack/ 2>/dev/null || true
git commit -m "refactor(devops): rename helm/eu-jap-hack → helm/app-chart; add global envPrefix+domain"
```

---

### Task 8: Add Postgres StatefulSet + Service

**Files:**
- Create: `helm/app-chart/templates/postgres-statefulset.yaml`
- Create: `helm/app-chart/templates/postgres-service.yaml`
- Modify: `helm/app-chart/values.yaml` (add `postgres:` block)

- [ ] **Step 1: Add `postgres:` block to `helm/app-chart/values.yaml`**

Append after existing top-level keys:

```yaml
# =============================================================================
# Postgres (single pod, multiple DBs)
# =============================================================================
postgres:
  enabled: true
  image:
    repository: postgres
    tag: "16-alpine"
    pullPolicy: IfNotPresent
  service:
    port: 5432
  storage:
    size: 20Gi
    storageClass: local-path
  databases:
    - name: backend
      user: backend
    - name: keycloak
      user: keycloak
    - name: waltid_wallet
      user: waltid
  superuser: postgres
  # Admin + per-DB passwords are resolved from Vault (via bootstrap) into
  # the k8s Secret "app-chart-postgres-creds" (envFrom below).
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits:   { cpu: 1500m, memory: 2Gi }
```

- [ ] **Step 2: Write `helm/app-chart/templates/postgres-service.yaml`**

```yaml
{{- if .Values.postgres.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "app-chart.fullname" . }}-postgres
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
    app.kubernetes.io/component: postgres
spec:
  type: ClusterIP
  ports:
    - name: postgres
      port: {{ .Values.postgres.service.port }}
      targetPort: 5432
  selector:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

- [ ] **Step 3: Write `helm/app-chart/templates/postgres-statefulset.yaml`**

```yaml
{{- if .Values.postgres.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "app-chart.fullname" . }}-postgres-init
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
data:
  01-databases.sh: |
    #!/bin/sh
    set -eu
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      {{- range .Values.postgres.databases }}
      DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{{ .user }}') THEN
          CREATE ROLE {{ .user }} LOGIN PASSWORD '$POSTGRES_{{ .name | upper }}_PASSWORD';
        END IF;
      END \$\$;
      SELECT 'CREATE DATABASE {{ .name }} OWNER {{ .user }}'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '{{ .name }}')\gexec
      GRANT ALL PRIVILEGES ON DATABASE {{ .name }} TO {{ .user }};
      {{- end }}
    EOSQL
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "app-chart.fullname" . }}-postgres
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
    app.kubernetes.io/component: postgres
spec:
  serviceName: {{ include "app-chart.fullname" . }}-postgres
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: postgres
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgres
        app.kubernetes.io/instance: {{ .Release.Name }}
        app.kubernetes.io/component: postgres
    spec:
      containers:
        - name: postgres
          image: "{{ .Values.postgres.image.repository }}:{{ .Values.postgres.image.tag }}"
          imagePullPolicy: {{ .Values.postgres.image.pullPolicy }}
          ports:
            - name: postgres
              containerPort: 5432
          env:
            - name: POSTGRES_USER
              value: {{ .Values.postgres.superuser }}
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          envFrom:
            - secretRef:
                name: {{ include "app-chart.fullname" . }}-postgres-creds
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "{{ .Values.postgres.superuser }}"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "{{ .Values.postgres.superuser }}"]
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
            - name: init
              mountPath: /docker-entrypoint-initdb.d
          resources:
            {{- toYaml .Values.postgres.resources | nindent 12 }}
      volumes:
        - name: init
          configMap:
            name: {{ include "app-chart.fullname" . }}-postgres-init
            defaultMode: 0755
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: {{ .Values.postgres.storage.storageClass | quote }}
        resources:
          requests:
            storage: {{ .Values.postgres.storage.size }}
{{- end }}
```

Note: the Secret `app-chart-postgres-creds` is created by `bootstrap.sh` (Phase 7) with keys `POSTGRES_PASSWORD`, `POSTGRES_BACKEND_PASSWORD`, `POSTGRES_KEYCLOAK_PASSWORD`, `POSTGRES_WALTID_WALLET_PASSWORD`.

- [ ] **Step 4: Render dry-run**

Run:
```bash
helm template app helm/app-chart/ --show-only templates/postgres-statefulset.yaml
helm template app helm/app-chart/ --show-only templates/postgres-service.yaml
```
Expected: ConfigMap + StatefulSet + Service, init script creates 3 DBs.

- [ ] **Step 5: Commit**

```bash
git add helm/app-chart/templates/postgres-statefulset.yaml \
        helm/app-chart/templates/postgres-service.yaml \
        helm/app-chart/values.yaml
git commit -m "feat(devops): Postgres StatefulSet with init-script for backend/keycloak/waltid DBs"
```

---

### Task 9: Add Postgres backup CronJob

**Files:**
- Create: `helm/app-chart/templates/postgres-backup-cronjob.yaml`
- Modify: `helm/app-chart/values.yaml` (add `backup:` block)

- [ ] **Step 1: Add `backup:` block to `helm/app-chart/values.yaml`**

Append:

```yaml
# =============================================================================
# Nightly pg_dump backup CronJob → hostPath
# =============================================================================
backup:
  enabled: true
  schedule: "0 2 * * *"
  retentionDays: 14
  hostPath: /data/backups
  image:
    repository: postgres
    tag: "16-alpine"
```

- [ ] **Step 2: Write `helm/app-chart/templates/postgres-backup-cronjob.yaml`**

```yaml
{{- if and .Values.postgres.enabled .Values.backup.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "app-chart.fullname" . }}-postgres-backup
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
    app.kubernetes.io/component: backup
spec:
  schedule: {{ .Values.backup.schedule | quote }}
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: pg-dump
              image: "{{ .Values.backup.image.repository }}:{{ .Values.backup.image.tag }}"
              env:
                - name: PGHOST
                  value: {{ include "app-chart.fullname" . }}-postgres
                - name: PGPORT
                  value: "5432"
                - name: PGUSER
                  value: {{ .Values.postgres.superuser }}
                - name: RETENTION_DAYS
                  value: {{ .Values.backup.retentionDays | quote }}
              envFrom:
                - secretRef:
                    name: {{ include "app-chart.fullname" . }}-postgres-creds
              command:
                - /bin/sh
                - -c
                - |
                  set -eu
                  export PGPASSWORD="$POSTGRES_PASSWORD"
                  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
                  DEST="/backups/$STAMP"
                  mkdir -p "$DEST"
                  {{- range .Values.postgres.databases }}
                  echo "Dumping {{ .name }}..."
                  pg_dump -Fc --clean --if-exists -d {{ .name }} -f "$DEST/{{ .name }}.dump"
                  {{- end }}
                  echo "Pruning backups older than ${RETENTION_DAYS}d..."
                  find /backups -mindepth 1 -maxdepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} +
                  echo "Done."
              volumeMounts:
                - name: backups
                  mountPath: /backups
          volumes:
            - name: backups
              hostPath:
                path: {{ .Values.backup.hostPath }}
                type: DirectoryOrCreate
{{- end }}
```

- [ ] **Step 3: Render dry-run**

Run:
```bash
helm template app helm/app-chart/ --show-only templates/postgres-backup-cronjob.yaml
```
Expected: CronJob with nightly schedule, pg_dump for each of 3 DBs, 14-day prune.

- [ ] **Step 4: Commit**

```bash
git add helm/app-chart/templates/postgres-backup-cronjob.yaml helm/app-chart/values.yaml
git commit -m "feat(devops): nightly pg_dump CronJob to /data/backups with 14d retention"
```

---

### Task 10: Add NetworkPolicy template

**Files:**
- Create: `helm/app-chart/templates/networkpolicy.yaml`

- [ ] **Step 1: Write `helm/app-chart/templates/networkpolicy.yaml`**

```yaml
{{- if .Values.networkPolicy.enabled }}
---
# Default-deny all ingress to the apps namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
# Allow haproxy-ingress (in its own namespace) to reach any pod in this ns
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-haproxy-ingress
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ .Values.networkPolicy.ingressNamespace | quote }}
---
# Allow intra-namespace traffic (pods can talk to each other)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-intra-namespace
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: {}
{{- end }}
```

- [ ] **Step 2: Add `networkPolicy:` block to `helm/app-chart/values.yaml`**

Append:

```yaml
networkPolicy:
  enabled: true
  ingressNamespace: infra         # namespace where haproxy runs (= infra-chart release ns)
```

- [ ] **Step 3: Render dry-run**

Run:
```bash
helm template app helm/app-chart/ --show-only templates/networkpolicy.yaml
```
Expected: 3 NetworkPolicy manifests.

- [ ] **Step 4: Commit**

```bash
git add helm/app-chart/templates/networkpolicy.yaml helm/app-chart/values.yaml
git commit -m "feat(devops): default-deny NetworkPolicy with haproxy + intra-ns allow rules"
```

---

### Task 11: Add Vault-token Secret references to backend + provisioning deployments

**Files:**
- Modify: `helm/app-chart/templates/backend-deployment.yaml`
- Modify: `helm/app-chart/templates/provisioning-deployment.yaml`
- Modify: `helm/app-chart/values.yaml` (remove `AUTH_ENABLED` key per CLAUDE.md invariant)

Per CLAUDE.md: "Auth is always on — there is no `AUTH_ENABLED` toggle". Remove it from values.

- [ ] **Step 1: Remove `AUTH_ENABLED: "false"` from `backend.env` in `helm/app-chart/values.yaml`**

Edit the `backend.env` block — delete the line `AUTH_ENABLED: "false"`.

- [ ] **Step 2: Update `helm/app-chart/templates/backend-deployment.yaml` — add Vault token envFrom**

Find the existing `envFrom:` block (currently references `{{ include "app-chart.fullname" . }}-backend-secret`). Extend to also reference a Vault-token Secret. Replace the block:

Before:
```yaml
          envFrom:
            - secretRef:
                name: {{ include "app-chart.fullname" . }}-backend-secret
                optional: true
```

After:
```yaml
          envFrom:
            - secretRef:
                name: {{ include "app-chart.fullname" . }}-backend-secret
                optional: true
            - secretRef:
                name: backend-vault-token         # created by bootstrap.sh
                optional: false
            - secretRef:
                name: {{ include "app-chart.fullname" . }}-postgres-creds
                optional: false
```

- [ ] **Step 3: Update `helm/app-chart/templates/provisioning-deployment.yaml` — same envFrom pattern**

Find the container's `envFrom:` (or add one if missing). Append:

```yaml
          envFrom:
            - secretRef:
                name: {{ include "app-chart.fullname" . }}-provisioning-secret
                optional: true
            - secretRef:
                name: provisioning-vault-token    # created by bootstrap.sh
                optional: false
```

- [ ] **Step 4: Lint + render**

Run:
```bash
helm lint helm/app-chart/
helm template app helm/app-chart/ --show-only templates/backend-deployment.yaml | grep -A2 "secretRef:"
```
Expected: three `secretRef` entries for backend (existing + vault-token + postgres-creds).

- [ ] **Step 5: Commit**

```bash
git add helm/app-chart/templates/backend-deployment.yaml \
        helm/app-chart/templates/provisioning-deployment.yaml \
        helm/app-chart/values.yaml
git commit -m "feat(devops): wire backend+provisioning to Vault-token and postgres-creds Secrets; drop AUTH_ENABLED"
```

---

### Task 12: Switch Keycloak deployment from H2 to Postgres

**Files:**
- Modify: `helm/app-chart/templates/keycloak-deployment.yaml`
- Modify: `helm/app-chart/values.yaml` (`keycloak.db` block)

- [ ] **Step 1: Update `keycloak.db` in `helm/app-chart/values.yaml`**

Replace the existing `keycloak.db` block:

```yaml
  db:
    vendor: postgres
    host: ""                        # templated: <fullname>-postgres
    database: keycloak
    username: keycloak
    # password resolved via envFrom → app-chart-postgres-creds (KC_DB_PASSWORD)
```

- [ ] **Step 2: Update `helm/app-chart/templates/keycloak-deployment.yaml`**

Replace the `env:` block in the keycloak container with:

```yaml
          env:
            - name: KEYCLOAK_ADMIN
              value: {{ .Values.keycloak.adminUsername | quote }}
            - name: KEYCLOAK_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-admin
                  key: password
            - name: KC_DB
              value: {{ .Values.keycloak.db.vendor | quote }}
            - name: KC_DB_URL
              value: "jdbc:postgresql://{{ include \"app-chart.fullname\" . }}-postgres:5432/{{ .Values.keycloak.db.database }}"
            - name: KC_DB_USERNAME
              value: {{ .Values.keycloak.db.username | quote }}
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "app-chart.fullname" . }}-postgres-creds
                  key: POSTGRES_KEYCLOAK_PASSWORD
            - name: KC_HOSTNAME
              value: {{ include "app-chart.host" (dict "subdomain" "auth" "ctx" .) | quote }}
            - name: KC_PROXY
              value: edge
```

- [ ] **Step 3: Lint + render**

Run:
```bash
helm lint helm/app-chart/
helm template app helm/app-chart/ --show-only templates/keycloak-deployment.yaml | grep -E "KC_DB|KC_HOSTNAME"
```
Expected: KC_DB=postgres, KC_DB_URL=jdbc:postgresql://..., KC_HOSTNAME=auth.dev.dataspace...

- [ ] **Step 4: Commit**

```bash
git add helm/app-chart/templates/keycloak-deployment.yaml helm/app-chart/values.yaml
git commit -m "feat(devops): switch Keycloak to Postgres backend; per-env KC_HOSTNAME"
```

---

### Task 13: Add PVC + persistent storage to walt.id wallet-api

**Files:**
- Modify: `helm/app-chart/templates/waltid-deployment.yaml`
- Modify: `helm/app-chart/values.yaml` (`waltidWalletApi.storage`)

- [ ] **Step 1: Add storage block to `waltidWalletApi` in values.yaml**

Under `waltidWalletApi:`, add:

```yaml
  storage:
    enabled: true
    size: 2Gi
    storageClass: local-path
```

- [ ] **Step 2: Add PVC + volume mount for wallet-api in `helm/app-chart/templates/waltid-deployment.yaml`**

Find the wallet-api Deployment (first of three in that file). In its `spec.template.spec`, add a `volumes:` list and a `volumeMounts:` on the container:

```yaml
          volumeMounts:
            - name: data
              mountPath: /waltid-wallet-api/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: {{ include "app-chart.fullname" . }}-waltid-wallet-data
```

At the top of the file (before the first `---`), add the PVC:

```yaml
{{- if .Values.waltidWalletApi.storage.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "app-chart.fullname" . }}-waltid-wallet-data
  labels:
    {{- include "app-chart.labels" . | nindent 4 }}
    app.kubernetes.io/component: waltid-wallet
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: {{ .Values.waltidWalletApi.storage.storageClass | quote }}
  resources:
    requests:
      storage: {{ .Values.waltidWalletApi.storage.size }}
---
{{- end }}
```

- [ ] **Step 3: Render + verify**

Run:
```bash
helm template app helm/app-chart/ --show-only templates/waltid-deployment.yaml | grep -B1 -A3 "volumeMounts\|PersistentVolumeClaim"
```
Expected: PVC manifest + volumeMounts in wallet-api container.

- [ ] **Step 4: Commit**

```bash
git add helm/app-chart/templates/waltid-deployment.yaml helm/app-chart/values.yaml
git commit -m "feat(devops): persist waltid-wallet-api /data on local-path PVC"
```

---

### Task 14: Template portal hostnames via `app-chart.host` helper

**Files:**
- Modify: `helm/app-chart/templates/portal-ingress.yaml`
- Modify: `helm/app-chart/templates/backend-ingress.yaml`
- Modify: `helm/app-chart/templates/keycloak-ingress.yaml`
- Modify: `helm/app-chart/templates/provisioning-service.yaml` (no ingress per spec; skip unless already has one)
- Modify: `helm/app-chart/templates/waltid-ingress.yaml`
- Modify: `helm/app-chart/values.yaml` (replace per-app `ingress.host: ""` with `ingress.subdomain: ...`)

- [ ] **Step 1: Replace `ingress.host` with `ingress.subdomain` in values.yaml**

For every top-level app key with an `ingress.host: ""`, replace with the corresponding subdomain:

| App | subdomain |
|-----|-----------|
| backend | api |
| portalDataspace | portal-dataspace |
| portalTataAdmin | portal-admin |
| portalTataPublic | portal-public |
| portalWallet | portal-wallet |
| portalInsurance | portal-insurance |
| portalCompany | portal-company |
| keycloak | auth |
| waltidWalletApi | waltid-wallet |
| waltidIssuerApi | waltid-issuer |
| waltidVerifierApi | waltid-verifier |

Example — change:

```yaml
backend:
  ...
  ingress:
    host: ""
```

To:

```yaml
backend:
  ...
  ingress:
    subdomain: api
```

Repeat for all 11 apps above.

Also add to the top of `values.yaml` (under `global:` already present):

```yaml
ingress:
  className: haproxy
  clusterIssuer: letsencrypt-prod
  tls: true
```

- [ ] **Step 2: Update each Ingress template to use `app-chart.host` helper**

For each `*-ingress.yaml` template, replace `host: {{ .Values.<app>.ingress.host }}` with:

```yaml
  rules:
    - host: {{ include "app-chart.host" (dict "subdomain" .Values.<app>.ingress.subdomain "ctx" .) }}
```

And add TLS block + annotations at the top of each Ingress:

```yaml
  annotations:
    cert-manager.io/cluster-issuer: {{ .Values.ingress.clusterIssuer }}
    haproxy.org/ssl-redirect: "true"
spec:
  ingressClassName: {{ .Values.ingress.className }}
  tls:
    - hosts:
        - {{ include "app-chart.host" (dict "subdomain" .Values.<app>.ingress.subdomain "ctx" .) }}
      secretName: {{ .Values.<app>.ingress.subdomain }}-tls
```

Replace `<app>` with the actual key (e.g. `backend`, `keycloak`, `portalTataAdmin`). For `portal-ingress.yaml` — if it uses the same `$portals` dict pattern as `portal-deployment.yaml`, update the loop to read `subdomain` from the per-portal value block and build the host via the helper.

- [ ] **Step 3: Lint + render a few hosts**

Run:
```bash
helm lint helm/app-chart/
helm template app helm/app-chart/ --set global.envPrefix=dev | grep "host:"
```
Expected: all hosts end in `.dev.dataspace.smartsenselabs.com`; no `""` hosts.

- [ ] **Step 4: Commit**

```bash
git add helm/app-chart/templates/*-ingress.yaml helm/app-chart/values.yaml
git commit -m "feat(devops): per-env ingress hosts via app-chart.host helper; cert-manager annotations"
```

---

## Phase 4 — Per-env values files

### Task 15: Create `values-dev.yaml`, `values-qa.yaml`, `values-prod.yaml` for both charts

**Files:**
- Create: `helm/infra-chart/values-dev.yaml`
- Create: `helm/infra-chart/values-qa.yaml`
- Create: `helm/infra-chart/values-prod.yaml`
- Create: `helm/app-chart/values-dev.yaml`
- Create: `helm/app-chart/values-qa.yaml`
- Create: `helm/app-chart/values-prod.yaml`

- [ ] **Step 1: Write `helm/infra-chart/values-dev.yaml`**

```yaml
global:
  envPrefix: dev

# Use LE staging in dev to avoid rate limits while iterating
issuers:
  letsencryptStaging:
    enabled: true
  letsencryptProd:
    enabled: true

kube-prometheus-stack:
  prometheus:
    prometheusSpec:
      retention: 3d
      storageSpec:
        volumeClaimTemplate:
          spec:
            resources:
              requests:
                storage: 5Gi

loki:
  singleBinary:
    persistence:
      size: 5Gi
```

- [ ] **Step 2: Write `helm/infra-chart/values-qa.yaml`**

```yaml
global:
  envPrefix: qa

kube-prometheus-stack:
  prometheus:
    prometheusSpec:
      retention: 7d
```

- [ ] **Step 3: Write `helm/infra-chart/values-prod.yaml`**

```yaml
global:
  envPrefix: prod

kube-prometheus-stack:
  prometheus:
    prometheusSpec:
      retention: 14d
      storageSpec:
        volumeClaimTemplate:
          spec:
            resources:
              requests:
                storage: 20Gi

loki:
  singleBinary:
    persistence:
      size: 20Gi
```

- [ ] **Step 4: Write `helm/app-chart/values-dev.yaml`**

```yaml
global:
  envPrefix: dev
  imageRegistry: public.ecr.aws/smartsense     # confirm actual ECR_NAMESPACE before deploy

backend:
  image:
    tag: latest
  replicaCount: 1

portalDataspace:    { image: { tag: latest } }
portalTataAdmin:    { image: { tag: latest } }
portalTataPublic:   { image: { tag: latest } }
portalWallet:       { image: { tag: latest } }
portalInsurance:    { image: { tag: latest } }
portalCompany:      { image: { tag: latest } }

keycloak:
  image: { tag: latest }

postgres:
  storage:
    size: 10Gi

backup:
  retentionDays: 3
```

- [ ] **Step 5: Write `helm/app-chart/values-qa.yaml`**

```yaml
global:
  envPrefix: qa
  imageRegistry: public.ecr.aws/smartsense

backend:            { image: { tag: "0.1.0" } }
portalDataspace:    { image: { tag: "0.1.0" } }
portalTataAdmin:    { image: { tag: "0.1.0" } }
portalTataPublic:   { image: { tag: "0.1.0" } }
portalWallet:       { image: { tag: "0.1.0" } }
portalInsurance:    { image: { tag: "0.1.0" } }
portalCompany:      { image: { tag: "0.1.0" } }
keycloak:           { image: { tag: "0.1.0" } }

backup:
  retentionDays: 7
```

- [ ] **Step 6: Write `helm/app-chart/values-prod.yaml`**

```yaml
global:
  envPrefix: prod
  imageRegistry: public.ecr.aws/smartsense

backend:            { image: { tag: "0.1.0" }, replicaCount: 1 }
portalDataspace:    { image: { tag: "0.1.0" } }
portalTataAdmin:    { image: { tag: "0.1.0" } }
portalTataPublic:   { image: { tag: "0.1.0" } }
portalWallet:       { image: { tag: "0.1.0" } }
portalInsurance:    { image: { tag: "0.1.0" } }
portalCompany:      { image: { tag: "0.1.0" } }
keycloak:           { image: { tag: "0.1.0" } }

postgres:
  storage:
    size: 50Gi

backup:
  retentionDays: 14

issuers:
  letsencryptStaging:
    enabled: false                               # prod never uses staging
```

- [ ] **Step 7: Lint each combination**

Run:
```bash
for env in dev qa prod; do
  helm lint helm/infra-chart/ -f helm/infra-chart/values.yaml -f helm/infra-chart/values-$env.yaml
  helm lint helm/app-chart/   -f helm/app-chart/values.yaml   -f helm/app-chart/values-$env.yaml
done
```
Expected: `0 chart(s) failed` for all 6 combinations.

- [ ] **Step 8: Commit**

```bash
git add helm/infra-chart/values-*.yaml helm/app-chart/values-*.yaml
git commit -m "feat(devops): per-env values files for infra-chart and app-chart"
```

---

## Phase 5 — GitOps restructure

### Task 16: Migrate existing tenant EDC Applications to per-env folders

**Files:**
- Move: `gitops/applications/*.yaml` → `gitops/envs/dev/tenants/*.yaml`
- Create: `gitops/envs/{qa,prod}/tenants/.gitkeep`

- [ ] **Step 1: Create new structure**

Run:
```bash
mkdir -p gitops/envs/dev/tenants gitops/envs/qa/tenants gitops/envs/prod/tenants
touch gitops/envs/qa/tenants/.gitkeep gitops/envs/prod/tenants/.gitkeep
```

- [ ] **Step 2: Move existing tenant Applications**

Run:
```bash
git mv gitops/applications/bmw-edc.yaml                         gitops/envs/dev/tenants/
git mv gitops/applications/honda-cars-edc.yaml                  gitops/envs/dev/tenants/
git mv gitops/applications/mercedes-edc.yaml                    gitops/envs/dev/tenants/
git mv gitops/applications/smartsense-consulting-solution-edc.yaml gitops/envs/dev/tenants/
git mv gitops/applications/toyota-motor-belgium-edc.yaml        gitops/envs/dev/tenants/
git mv gitops/applications/volkswagen-edc.yaml                  gitops/envs/dev/tenants/
git mv gitops/applications/.gitkeep                             gitops/envs/dev/tenants/ 2>/dev/null || true
git mv gitops/applications/template.yaml.hbs                    gitops/envs/dev/tenants/ 2>/dev/null || true
```

Keep `gitops/applications/template.yaml.hbs` at the original path if the provisioning service references it — check first:

```bash
grep -rn "gitops/applications" provisioning/ backend/
```
If references exist, leave the `.hbs` in place and document that it's a template source, not a live Application.

- [ ] **Step 3: Update each tenant namespace to include env prefix**

For each of the 6 tenant Applications in `gitops/envs/dev/tenants/`, edit `spec.destination.namespace`:

Before: `namespace: edc-bmw`
After: `namespace: edc-bmw-dev`

(Tenants in qa/prod will use `edc-bmw-qa`, `edc-bmw-prod` — provisioning service templating adjusts based on target env.)

- [ ] **Step 4: Update provisioning service values to reflect new path (non-code change)**

Note only — the provisioning service's `GIT_REPO_PATH` / target-file path is controlled via env vars in values.yaml. Later in Task 25 (bootstrap docs) we document the new `gitops/envs/<env>/tenants/` location.

- [ ] **Step 5: Commit**

```bash
git add gitops/
git commit -m "refactor(devops): move tenant Applications to gitops/envs/<env>/tenants/ layout"
```

---

### Task 17: Create app-of-apps and per-env infra/app Applications

**Files:**
- Create: `gitops/bootstrap/app-of-apps-dev.yaml`
- Create: `gitops/bootstrap/app-of-apps-qa.yaml`
- Create: `gitops/bootstrap/app-of-apps-prod.yaml`
- Create: `gitops/envs/dev/infra.yaml`
- Create: `gitops/envs/dev/app.yaml`
- Create: `gitops/envs/qa/infra.yaml`
- Create: `gitops/envs/qa/app.yaml`
- Create: `gitops/envs/prod/infra.yaml`
- Create: `gitops/envs/prod/app.yaml`

- [ ] **Step 1: Write `gitops/bootstrap/app-of-apps-dev.yaml`**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-dev
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/smartSenseSolutions/jap-eu-hack-2026
    targetRevision: main
    path: gitops/envs/dev
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 2: Write `gitops/bootstrap/app-of-apps-qa.yaml` and `app-of-apps-prod.yaml`**

Copy the dev file, changing:
- `name: root-dev` → `root-qa` / `root-prod`
- `path: gitops/envs/dev` → `gitops/envs/qa` / `gitops/envs/prod`
- **prod only:** remove `automated.` block entirely (replace whole `syncPolicy:` with `syncOptions` only — manual sync for prod).

prod version final:

```yaml
spec:
  ...
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 3: Write `gitops/envs/dev/infra.yaml`**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: infra-dev
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/smartSenseSolutions/jap-eu-hack-2026
    targetRevision: main
    path: helm/infra-chart
    helm:
      valueFiles:
        - values.yaml
        - values-dev.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: infra
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

- [ ] **Step 4: Write `gitops/envs/dev/app.yaml`**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-dev
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "0"
    argocd-image-updater.argoproj.io/image-list: |
      backend=public.ecr.aws/smartsense/backend,
      portal-dataspace=public.ecr.aws/smartsense/portal-dataspace,
      portal-tata-admin=public.ecr.aws/smartsense/portal-tata-admin,
      portal-tata-public=public.ecr.aws/smartsense/portal-tata-public,
      portal-wallet=public.ecr.aws/smartsense/portal-wallet,
      portal-insurance=public.ecr.aws/smartsense/portal-insurance,
      portal-company=public.ecr.aws/smartsense/portal-company,
      keycloak=public.ecr.aws/smartsense/keycloak
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
    argocd-image-updater.argoproj.io/backend.update-strategy: semver
    argocd-image-updater.argoproj.io/backend.helm.image-tag: backend.image.tag
    argocd-image-updater.argoproj.io/portal-dataspace.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-dataspace.helm.image-tag: portalDataspace.image.tag
    argocd-image-updater.argoproj.io/portal-tata-admin.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-tata-admin.helm.image-tag: portalTataAdmin.image.tag
    argocd-image-updater.argoproj.io/portal-tata-public.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-tata-public.helm.image-tag: portalTataPublic.image.tag
    argocd-image-updater.argoproj.io/portal-wallet.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-wallet.helm.image-tag: portalWallet.image.tag
    argocd-image-updater.argoproj.io/portal-insurance.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-insurance.helm.image-tag: portalInsurance.image.tag
    argocd-image-updater.argoproj.io/portal-company.update-strategy: semver
    argocd-image-updater.argoproj.io/portal-company.helm.image-tag: portalCompany.image.tag
    argocd-image-updater.argoproj.io/keycloak.update-strategy: semver
    argocd-image-updater.argoproj.io/keycloak.helm.image-tag: keycloak.image.tag
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/smartSenseSolutions/jap-eu-hack-2026
    targetRevision: main
    path: helm/app-chart
    helm:
      valueFiles:
        - values.yaml
        - values-dev.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: apps
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

- [ ] **Step 5: Write `gitops/envs/qa/infra.yaml` and `app.yaml`**

Copy the dev versions, changing:
- `name: infra-dev` → `infra-qa` / `name: app-dev` → `app-qa`
- `values-dev.yaml` → `values-qa.yaml`
- Remove the entire `argocd-image-updater.argoproj.io/*` annotation block from `app.yaml` (promotion to qa is manual via workflow_dispatch).

- [ ] **Step 6: Write `gitops/envs/prod/infra.yaml` and `app.yaml`**

Copy the qa versions, changing:
- `-qa` → `-prod`
- `values-qa.yaml` → `values-prod.yaml`
- Remove `automated:` block entirely from `syncPolicy` (manual sync for prod):

```yaml
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

- [ ] **Step 7: Validate with kubeval**

Run:
```bash
for f in gitops/bootstrap/*.yaml gitops/envs/*/infra.yaml gitops/envs/*/app.yaml; do
  kubeval --additional-schema-locations https://raw.githubusercontent.com/datreeio/CRDs-catalog/main --strict "$f"
done
```
Expected: each file passes (Argo CRDs are recognized via catalog).

If kubeval rejects due to missing Argo CRD schema, use `--ignore-missing-schemas` as fallback:

```bash
kubeval --ignore-missing-schemas gitops/bootstrap/*.yaml gitops/envs/*/*.yaml
```

- [ ] **Step 8: Commit**

```bash
git add gitops/bootstrap/ gitops/envs/
git commit -m "feat(devops): app-of-apps per env + infra/app Applications with Image Updater on dev"
```

---

## Phase 6 — GitHub Actions workflows

### Task 18: Create `ci.yml` — unit tests on PR and main

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Helm lint (infra-chart)
        run: |
          curl -fsSL -o /tmp/get-helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
          bash /tmp/get-helm.sh
          helm dep update helm/infra-chart
          helm lint helm/infra-chart

      - name: Helm lint (app-chart)
        run: helm lint helm/app-chart

      - name: actionlint
        uses: reviewdog/action-actionlint@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate**

Run:
```bash
actionlint .github/workflows/ci.yml
```
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): unit tests + helm lint + actionlint on PR and main"
```

---

### Task 19: Create `release-build.yml` — tag-triggered ECR push

**Files:**
- Create: `.github/workflows/release-build.yml`

- [ ] **Step 1: Write `.github/workflows/release-build.yml`**

```yaml
name: Release Build

on:
  push:
    tags:
      - "backend-v*"
      - "portal-dataspace-v*"
      - "portal-tata-admin-v*"
      - "portal-tata-public-v*"
      - "portal-wallet-v*"
      - "portal-insurance-v*"
      - "portal-company-v*"
      - "keycloak-v*"
      - "provisioning-v*"

jobs:
  authorize:
    runs-on: ubuntu-latest
    steps:
      - name: Check authorized actor
        run: |
          ALLOWED="${{ secrets.ALLOWED_ACTORS }}"
          ACTOR="${{ github.actor }}"
          echo "Actor: ${ACTOR}"
          IFS=',' read -ra USERS <<< "${ALLOWED}"
          for USER in "${USERS[@]}"; do
            TRIMMED="${USER#"${USER%%[![:space:]]*}"}"
            TRIMMED="${TRIMMED%"${TRIMMED##*[![:space:]]}"}"
            if [ "${TRIMMED}" = "${ACTOR}" ]; then
              echo "Authorization granted for ${ACTOR}"
              exit 0
            fi
          done
          echo "Error: ${ACTOR} is not authorized to trigger this workflow."
          exit 1

  build-and-push:
    needs: authorize
    runs-on: ubuntu-latest
    outputs:
      app: ${{ steps.parse.outputs.app }}
      version: ${{ steps.parse.outputs.version }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Parse tag
        id: parse
        run: |
          TAG="${GITHUB_REF_NAME}"
          APP="${TAG%-v*}"
          VERSION="${TAG##*-v}"
          echo "app=${APP}" >> "$GITHUB_OUTPUT"
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
          echo "Parsed: app=${APP}, version=${VERSION}"

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        with:
          platforms: linux/amd64,linux/arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to ECR Public
        uses: aws-actions/amazon-ecr-login@v2
        with:
          registry-type: public

      - name: Resolve Dockerfile and context
        id: dockerfile
        run: |
          APP="${{ steps.parse.outputs.app }}"
          case "$APP" in
            backend)
              echo "file=backend/Dockerfile" >> "$GITHUB_OUTPUT"
              echo "context=." >> "$GITHUB_OUTPUT"
              echo "build_args=" >> "$GITHUB_OUTPUT"
              ;;
            portal-*)
              echo "file=apps/Dockerfile" >> "$GITHUB_OUTPUT"
              echo "context=." >> "$GITHUB_OUTPUT"
              echo "build_args=APP_NAME=$APP" >> "$GITHUB_OUTPUT"
              ;;
            keycloak)
              echo "file=keycloak/Dockerfile" >> "$GITHUB_OUTPUT"
              echo "context=keycloak/" >> "$GITHUB_OUTPUT"
              echo "build_args=" >> "$GITHUB_OUTPUT"
              ;;
            provisioning)
              echo "file=provisioning/Dockerfile" >> "$GITHUB_OUTPUT"
              echo "context=." >> "$GITHUB_OUTPUT"
              echo "build_args=" >> "$GITHUB_OUTPUT"
              ;;
            *)
              echo "Unknown app: $APP" >&2
              exit 1
              ;;
          esac

      - name: Build & push
        uses: docker/build-push-action@v6
        with:
          context: ${{ steps.dockerfile.outputs.context }}
          file: ${{ steps.dockerfile.outputs.file }}
          platforms: linux/amd64,linux/arm64
          push: true
          build-args: ${{ steps.dockerfile.outputs.build_args }}
          tags: |
            ${{ secrets.ECR_REGISTRY }}/${{ secrets.ECR_NAMESPACE }}/${{ steps.parse.outputs.app }}:${{ steps.parse.outputs.version }}
            ${{ secrets.ECR_REGISTRY }}/${{ secrets.ECR_NAMESPACE }}/${{ steps.parse.outputs.app }}:latest

  bump-dev-values:
    needs: build-and-push
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_PAT_VALUES_WRITE }}

      - name: Install yq
        run: |
          wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
          chmod +x /usr/local/bin/yq

      - name: Map app to values key
        id: map
        run: |
          APP="${{ needs.build-and-push.outputs.app }}"
          case "$APP" in
            backend)              KEY="backend.image.tag" ;;
            portal-dataspace)     KEY="portalDataspace.image.tag" ;;
            portal-tata-admin)    KEY="portalTataAdmin.image.tag" ;;
            portal-tata-public)   KEY="portalTataPublic.image.tag" ;;
            portal-wallet)        KEY="portalWallet.image.tag" ;;
            portal-insurance)     KEY="portalInsurance.image.tag" ;;
            portal-company)       KEY="portalCompany.image.tag" ;;
            keycloak)             KEY="keycloak.image.tag" ;;
            provisioning)         KEY="provisioning.image.tag" ;;
            *) echo "Unknown app: $APP" >&2; exit 1 ;;
          esac
          echo "key=$KEY" >> "$GITHUB_OUTPUT"

      - name: Bump values-dev.yaml
        run: |
          yq -i ".${{ steps.map.outputs.key }} = \"${{ needs.build-and-push.outputs.version }}\"" helm/app-chart/values-dev.yaml

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.GH_PAT_VALUES_WRITE }}
          branch: chore/bump-dev-${{ needs.build-and-push.outputs.app }}-${{ needs.build-and-push.outputs.version }}
          commit-message: "chore(dev): bump ${{ needs.build-and-push.outputs.app }} → ${{ needs.build-and-push.outputs.version }}"
          title: "chore(dev): bump ${{ needs.build-and-push.outputs.app }} → ${{ needs.build-and-push.outputs.version }}"
          body: |
            Automated dev tag bump. Argo CD will sync after merge.

            App: `${{ needs.build-and-push.outputs.app }}`
            Version: `${{ needs.build-and-push.outputs.version }}`
          base: main
```

- [ ] **Step 2: Validate**

Run:
```bash
actionlint .github/workflows/release-build.yml
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-build.yml
git commit -m "feat(ci): release-build workflow — tag <app>-v* → ECR push + bump-dev PR"
```

---

### Task 20: Create `promote.yml` — manual promotion to qa/prod

**Files:**
- Create: `.github/workflows/promote.yml`

- [ ] **Step 1: Write `.github/workflows/promote.yml`**

```yaml
name: Promote to Env

on:
  workflow_dispatch:
    inputs:
      env:
        description: "Target environment"
        required: true
        type: choice
        options: [qa, prod]
      app:
        description: "App name (e.g. backend, portal-tata-admin, keycloak)"
        required: true
        type: string
      version:
        description: "Version to promote (e.g. 1.2.3)"
        required: true
        type: string

jobs:
  authorize:
    runs-on: ubuntu-latest
    steps:
      - name: Check authorized actor
        run: |
          ALLOWED="${{ secrets.ALLOWED_ACTORS }}"
          ACTOR="${{ github.actor }}"
          IFS=',' read -ra USERS <<< "${ALLOWED}"
          for USER in "${USERS[@]}"; do
            TRIMMED="${USER#"${USER%%[![:space:]]*}"}"
            TRIMMED="${TRIMMED%"${TRIMMED##*[![:space:]]}"}"
            if [ "${TRIMMED}" = "${ACTOR}" ]; then exit 0; fi
          done
          echo "Error: ${ACTOR} not authorized."
          exit 1

  validate-image:
    needs: authorize
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Verify image exists in ECR Public
        run: |
          aws ecr-public describe-images \
            --repository-name "${{ secrets.ECR_NAMESPACE }}/${{ inputs.app }}" \
            --image-ids imageTag="${{ inputs.version }}" \
            --region us-east-1

  bump-values:
    needs: validate-image
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_PAT_VALUES_WRITE }}

      - name: Install yq
        run: |
          wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
          chmod +x /usr/local/bin/yq

      - name: Map app to values key
        id: map
        run: |
          case "${{ inputs.app }}" in
            backend)              KEY="backend.image.tag" ;;
            portal-dataspace)     KEY="portalDataspace.image.tag" ;;
            portal-tata-admin)    KEY="portalTataAdmin.image.tag" ;;
            portal-tata-public)   KEY="portalTataPublic.image.tag" ;;
            portal-wallet)        KEY="portalWallet.image.tag" ;;
            portal-insurance)     KEY="portalInsurance.image.tag" ;;
            portal-company)       KEY="portalCompany.image.tag" ;;
            keycloak)             KEY="keycloak.image.tag" ;;
            provisioning)         KEY="provisioning.image.tag" ;;
            *) echo "Unknown app"; exit 1 ;;
          esac
          echo "key=$KEY" >> "$GITHUB_OUTPUT"

      - name: Bump values-${{ inputs.env }}.yaml
        run: |
          yq -i ".${{ steps.map.outputs.key }} = \"${{ inputs.version }}\"" helm/app-chart/values-${{ inputs.env }}.yaml

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.GH_PAT_VALUES_WRITE }}
          branch: promote/${{ inputs.env }}-${{ inputs.app }}-${{ inputs.version }}
          commit-message: "promote(${{ inputs.env }}): ${{ inputs.app }} → ${{ inputs.version }}"
          title: "promote(${{ inputs.env }}): ${{ inputs.app }} → ${{ inputs.version }}"
          body: |
            Manual promotion.

            - Env: `${{ inputs.env }}`
            - App: `${{ inputs.app }}`
            - Version: `${{ inputs.version }}`

            Merging will trigger Argo CD sync for the ${{ inputs.env }} environment.
          base: main
```

- [ ] **Step 2: Validate**

Run:
```bash
actionlint .github/workflows/promote.yml
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/promote.yml
git commit -m "feat(ci): promote workflow — workflow_dispatch → bump values-<env>.yaml PR"
```

---

### Task 21: Deprecate old `docker-build-push.yml`

**Files:**
- Modify: `.github/workflows/docker-build-push.yml`

Keep the file (don't delete — one release cycle fallback per spec §6), but add a deprecation header.

- [ ] **Step 1: Add deprecation comment block at top of `.github/workflows/docker-build-push.yml`**

Insert after `name: Docker Build & Push`:

```yaml
# =============================================================================
# DEPRECATED — kept as one-release fallback.
# Use .github/workflows/release-build.yml (tag-triggered) for normal releases.
# Use .github/workflows/promote.yml (workflow_dispatch) for qa/prod promotion.
# Planned removal: after the first successful release cycle of the new workflows.
# =============================================================================
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docker-build-push.yml
git commit -m "docs(ci): mark docker-build-push.yml deprecated; kept as fallback"
```

---

## Phase 7 — Bootstrap script + vault-mapping

### Task 22: Create `helm/bootstrap.sh`

**Files:**
- Create: `helm/bootstrap.sh` (executable)
- Create: `helm/bootstrap/vault-mapping.yaml`
- Create: `helm/bootstrap/.env.example`

- [ ] **Step 1: Write `helm/bootstrap/.env.example`**

```bash
# -----------------------------------------------------------------------------
# Bootstrap secrets for jap-eu-hack-2026. Copy to .env.dev / .env.qa / .env.prod
# and fill in before running helm/bootstrap.sh.
# DO NOT COMMIT filled-in copies.
# -----------------------------------------------------------------------------

# Postgres
POSTGRES_PASSWORD="change-me-super-user"
POSTGRES_BACKEND_PASSWORD="change-me-backend"
POSTGRES_KEYCLOAK_PASSWORD="change-me-keycloak"
POSTGRES_WALTID_WALLET_PASSWORD="change-me-waltid"

# Keycloak
KEYCLOAK_ADMIN_PASSWORD="change-me-keycloak-admin"

# Grafana
GRAFANA_ADMIN_PASSWORD="change-me-grafana-admin"

# Walt.id operator wallet (≥32 chars — see backend CLAUDE.md)
OPERATOR_WALLET_PASSWORD="change-me-32-chars-minimum-1234567890"

# Provisioning service
PROVISIONING_CALLBACK_SECRET="change-me-callback-hmac"
GIT_AUTH_TOKEN="ghp_xxx_PAT_with_contents_write"

# Vault tokens for apps (after Vault init; populate via bootstrap vault-tokens step)
BACKEND_VAULT_TOKEN=""          # filled in automatically by bootstrap
PROVISIONING_VAULT_TOKEN=""
```

- [ ] **Step 2: Write `helm/bootstrap/vault-mapping.yaml`**

```yaml
# Maps .env.<env> keys to Vault KV paths.
# Used by bootstrap.sh populate-vault step.
mappings:
  - envKey: POSTGRES_PASSWORD
    vaultPath: secret/postgres/admin
    vaultKey: password
  - envKey: POSTGRES_BACKEND_PASSWORD
    vaultPath: secret/postgres/backend
    vaultKey: password
  - envKey: POSTGRES_KEYCLOAK_PASSWORD
    vaultPath: secret/postgres/keycloak
    vaultKey: password
  - envKey: POSTGRES_WALTID_WALLET_PASSWORD
    vaultPath: secret/postgres/waltid_wallet
    vaultKey: password
  - envKey: KEYCLOAK_ADMIN_PASSWORD
    vaultPath: secret/keycloak/admin
    vaultKey: password
  - envKey: GRAFANA_ADMIN_PASSWORD
    vaultPath: secret/grafana/admin
    vaultKey: password
  - envKey: OPERATOR_WALLET_PASSWORD
    vaultPath: secret/operator/wallet
    vaultKey: password
  - envKey: PROVISIONING_CALLBACK_SECRET
    vaultPath: secret/provisioning/callback
    vaultKey: secret
  - envKey: GIT_AUTH_TOKEN
    vaultPath: secret/provisioning/git
    vaultKey: token
```

- [ ] **Step 3: Write `helm/bootstrap.sh`**

```bash
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

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">>> $*"; }

case "$ENV" in
  dev|qa|prod) ;;
  *) die "Usage: $0 <dev|qa|prod> [step]" ;;
esac

# ----- prereq -----
step_prereq() {
  info "Checking prereqs..."
  command -v kubectl >/dev/null || die "kubectl not installed"
  command -v helm >/dev/null    || die "helm not installed"
  command -v yq >/dev/null      || die "yq not installed"
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
  local status
  status=$(kubectl -n "${VAULT_NS}" exec vault-0 -- vault status -format=json 2>/dev/null || true)
  local initialized
  initialized=$(echo "$status" | jq -r '.initialized // false')
  if [ "$initialized" = "true" ]; then
    info "Vault already initialized."
    return 0
  fi
  info "Running vault operator init..."
  local out
  out=$(kubectl -n "${VAULT_NS}" exec vault-0 -- vault operator init -format=json -key-shares=5 -key-threshold=3)
  echo "$out" > "${REPO_ROOT}/helm/bootstrap/.vault-init-${ENV}.json"
  chmod 600 "${REPO_ROOT}/helm/bootstrap/.vault-init-${ENV}.json"
  info "Vault init captured → helm/bootstrap/.vault-init-${ENV}.json (gitignored — keep offline backup!)"

  # Build unseal-keys Secret JSON
  local tmp="$(mktemp)"
  jq '{
    unseal_key_1: .unseal_keys_b64[0],
    unseal_key_2: .unseal_keys_b64[1],
    unseal_key_3: .unseal_keys_b64[2]
  }' "${REPO_ROOT}/helm/bootstrap/.vault-init-${ENV}.json" > "$tmp"
  kubectl -n "${VAULT_NS}" create secret generic vault-unseal-keys \
    --from-file=keys.json="$tmp" \
    --dry-run=client -o yaml | kubectl apply -f -
  rm "$tmp"

  # Store root token in Secret (short-lived convenience)
  local root_token
  root_token=$(jq -r '.root_token' "${REPO_ROOT}/helm/bootstrap/.vault-init-${ENV}.json")
  kubectl -n "${VAULT_NS}" create secret generic vault-root-token \
    --from-literal=token="$root_token" \
    --dry-run=client -o yaml | kubectl apply -f -
  info "vault-unseal-keys + vault-root-token Secrets applied."
}

# ----- vault-unseal -----
step_vault_unseal() {
  info "Triggering vault-unseal Job..."
  kubectl -n "${VAULT_NS}" delete job vault-unseal --ignore-not-found
  helm upgrade --install infra "${REPO_ROOT}/helm/infra-chart" \
    --namespace "${INFRA_NS}" \
    -f "${REPO_ROOT}/helm/infra-chart/values.yaml" \
    -f "${REPO_ROOT}/helm/infra-chart/values-${ENV}.yaml" \
    --reuse-values --wait --timeout 5m
  # Hook will have run; check status
  kubectl -n "${VAULT_NS}" exec vault-0 -- vault status | grep -q 'Sealed.*false' \
    || die "Vault still sealed after unseal Job"
  info "Vault unsealed."
}

# ----- vault-populate -----
step_vault_populate() {
  info "Populating Vault KV from ${ENV_FILE}..."
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
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

  # Create per-app Vault tokens (short-lived would need a real auth method;
  # for MVP use root-token Secret aliased for each app).
  kubectl -n "${APPS_NS}" create ns "${APPS_NS}" --dry-run=client -o yaml | kubectl apply -f -
  for app in backend provisioning; do
    kubectl -n "${APPS_NS}" create secret generic "${app}-vault-token" \
      --from-literal=VAULT_TOKEN="$token" \
      --from-literal=VAULT_ADDR="http://vault.${VAULT_NS}.svc.cluster.local:8200" \
      --dry-run=client -o yaml | kubectl apply -f -
  done

  # Materialise postgres creds Secret (env vars the StatefulSet needs)
  kubectl -n "${APPS_NS}" create secret generic app-chart-postgres-creds \
    --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    --from-literal=POSTGRES_BACKEND_PASSWORD="$POSTGRES_BACKEND_PASSWORD" \
    --from-literal=POSTGRES_KEYCLOAK_PASSWORD="$POSTGRES_KEYCLOAK_PASSWORD" \
    --from-literal=POSTGRES_WALTID_WALLET_PASSWORD="$POSTGRES_WALTID_WALLET_PASSWORD" \
    --dry-run=client -o yaml | kubectl apply -f -

  # Keycloak admin Secret
  kubectl -n "${APPS_NS}" create secret generic keycloak-admin \
    --from-literal=password="$KEYCLOAK_ADMIN_PASSWORD" \
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
  info "Argo will sync gitops/envs/${ENV}/"
}

# ----- verify -----
step_verify() {
  info "Waiting for all Applications to be Healthy + Synced..."
  local deadline=$((SECONDS + 900))
  while [ $SECONDS -lt $deadline ]; do
    local unhealthy
    unhealthy=$(kubectl -n "${ARGO_NS}" get applications -o json \
      | jq -r '.items[] | select(.status.health.status != "Healthy" or .status.sync.status != "Synced") | .metadata.name')
    if [ -z "$unhealthy" ]; then
      info "All Applications Healthy + Synced."
      return 0
    fi
    info "Waiting: $unhealthy"
    sleep 20
  done
  die "Timeout waiting for Applications"
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
```

- [ ] **Step 4: Make executable + gitignore sensitive artefacts**

Run:
```bash
chmod +x helm/bootstrap.sh
cat >> .gitignore <<'EOF'
# Bootstrap secrets — never commit
helm/bootstrap/.env.dev
helm/bootstrap/.env.qa
helm/bootstrap/.env.prod
helm/bootstrap/.vault-init-*.json
EOF
```

- [ ] **Step 5: Shellcheck validation**

Run:
```bash
shellcheck helm/bootstrap.sh
```
Expected: no errors (warnings about `!var` indirection are acceptable).

- [ ] **Step 6: Commit**

```bash
git add helm/bootstrap.sh helm/bootstrap/vault-mapping.yaml helm/bootstrap/.env.example .gitignore
git commit -m "feat(devops): idempotent bootstrap.sh with per-step execution + vault-mapping"
```

---

## Phase 8 — Documentation

### Task 23: Create `docs/devops/` folder — all 10 documents

**Files:**
- Create: `docs/devops/README.md`
- Create: `docs/devops/architecture.md`
- Create: `docs/devops/bootstrap-runbook.md`
- Create: `docs/devops/ci-cd.md`
- Create: `docs/devops/tls-ingress.md`
- Create: `docs/devops/vault-bootstrap.md`
- Create: `docs/devops/monitoring.md`
- Create: `docs/devops/backups-restore.md`
- Create: `docs/devops/tenant-onboarding.md`
- Create: `docs/devops/troubleshooting.md`

Each document gets a complete first-pass from the spec content. No "TBD" placeholders. Keep each file focused (the spec is the source of truth — docs/devops/ is the operator-facing subset).

- [ ] **Step 1: Write `docs/devops/README.md`**

```markdown
# DevOps — jap-eu-hack-2026

Self-managed kubeadm deployment across three independent single-node clusters (dev / qa / prod) with GitOps (Argo CD), HAProxy Ingress, Let's Encrypt HTTP-01 certs, local-path storage, Vault-backed secrets, and nightly Postgres backups.

## Quick Index

| Doc | Purpose |
|-----|---------|
| [architecture.md](architecture.md) | Overall topology, component diagram, traffic/data flow |
| [bootstrap-runbook.md](bootstrap-runbook.md) | Step-by-step cluster bringup on a fresh server |
| [ci-cd.md](ci-cd.md) | GitHub Actions workflows, tag/promote cadence |
| [tls-ingress.md](tls-ingress.md) | HAProxy + cert-manager + HTTP-01 flow |
| [vault-bootstrap.md](vault-bootstrap.md) | Vault init, unseal keys, KV structure, app tokens |
| [monitoring.md](monitoring.md) | Prometheus / Grafana / Loki configuration |
| [backups-restore.md](backups-restore.md) | Postgres pg_dump schedule + restore runbook |
| [tenant-onboarding.md](tenant-onboarding.md) | Add a new EDC tenant (Helm values + Argo Application) |
| [troubleshooting.md](troubleshooting.md) | Known failure modes with fixes |

## Design spec

The authoritative design is at `docs/superpowers/specs/2026-04-17-self-managed-k8s-devops-design.md`. Every decision (Q1–Q22) is recorded there.
```

- [ ] **Step 2: Write `docs/devops/architecture.md`**

Copy §1 ("High-Level Architecture") from the spec into this file. Include the ASCII topology diagram, traffic flow, deploy flow, and data flow subsections verbatim.

- [ ] **Step 3: Write `docs/devops/bootstrap-runbook.md`**

Copy §11 ("Bootstrap Runbook & Single-Click Install") from the spec. Expand with concrete prereq commands:

```markdown
# Bootstrap Runbook

## Server prereqs (Ubuntu 22.04+)

```bash
# Install kubeadm (official k8s docs)
sudo apt-get update && sudo apt-get install -y kubeadm kubectl kubelet
# kubeadm init
sudo kubeadm init --pod-network-cidr=192.168.0.0/16
mkdir -p $HOME/.kube && sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
# Untaint control plane (single-node)
kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true
# Install Calico CNI
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml
# Host dirs
sudo mkdir -p /data/{postgres,vault,waltid,backups,local-path}
sudo chown -R 1000:1000 /data
```

## DNS

Create A records for all hostnames listed in `helm/app-chart/values.yaml` under `<app>.ingress.subdomain` — all resolve to the server IP. Pattern: `<subdomain>.<env>.dataspace.smartsenselabs.com`.

Expected hostnames for dev (adjust `dev` → `qa` / `prod`):
- argocd.dev.dataspace.smartsenselabs.com
- grafana.dev.dataspace.smartsenselabs.com
- api.dev.dataspace.smartsenselabs.com
- auth.dev.dataspace.smartsenselabs.com
- portal-dataspace.dev.dataspace.smartsenselabs.com
- portal-admin.dev.dataspace.smartsenselabs.com
- portal-public.dev.dataspace.smartsenselabs.com
- portal-wallet.dev.dataspace.smartsenselabs.com
- portal-insurance.dev.dataspace.smartsenselabs.com
- portal-company.dev.dataspace.smartsenselabs.com
- waltid-wallet.dev.dataspace.smartsenselabs.com
- waltid-issuer.dev.dataspace.smartsenselabs.com
- waltid-verifier.dev.dataspace.smartsenselabs.com
- provisioning.dev.dataspace.smartsenselabs.com

## Secrets

```bash
cp helm/bootstrap/.env.example helm/bootstrap/.env.dev
# fill every empty value
```

## Run

```bash
./helm/bootstrap.sh dev
```

This runs all 7 steps. To re-run just one step:

```bash
./helm/bootstrap.sh dev vault-populate
```

## Verify

```bash
kubectl -n argocd get applications
# all should show: SYNCED / HEALTHY
```

Point browser at `https://argocd.dev.dataspace.smartsenselabs.com`. Admin password printed by `bootstrap.sh argocd-login`.

## Teardown

```bash
helm -n infra uninstall infra
kubectl delete ns infra apps argocd
# local-path data is on host; clean manually:
sudo rm -rf /data/local-path/* /data/postgres/* /data/vault/* /data/waltid/*
```

## Disaster recovery

1. Fresh kubeadm server.
2. Restore host dirs: `tar xzf backup.tgz -C /`.
3. Run `./helm/bootstrap.sh <env>` — the `infra` install will pick up the existing `/data/vault` and `/data/postgres` PVCs bound to the same hostPath.
4. If Vault data is restored, unseal keys must match — they're in `helm/bootstrap/.vault-init-<env>.json` (offline backup).
```

- [ ] **Step 4: Write `docs/devops/ci-cd.md`**

Copy §6 ("CI/CD Pipelines") from the spec. Add a concrete developer workflow:

```markdown
## Developer workflow

1. Cut feature branch, push, open PR to `main`.
2. CI runs unit tests + helm lint + actionlint.
3. Merge to main.
4. Tag a release: `git tag backend-v1.2.3 && git push origin backend-v1.2.3`.
5. GitHub Actions builds multi-arch image, pushes to ECR Public.
6. Workflow opens an auto-PR bumping `values-dev.yaml`.
7. Merge the bump PR → Argo CD syncs dev.
8. Verify at `https://api.dev.dataspace.smartsenselabs.com/api/health`.
9. Promote to qa:
   - In GitHub → Actions → "Promote to Env" → Run workflow.
   - env=`qa`, app=`backend`, version=`1.2.3`.
   - Review the opened PR, merge.
10. Same for prod, but **manually trigger sync in Argo UI** (prod has auto-sync off).
```

- [ ] **Step 5: Write `docs/devops/tls-ingress.md`**

Copy §7 from spec. Add debug commands:

```markdown
## Debugging a cert

```bash
kubectl describe certificate <host>-tls -n <ns>
kubectl describe order -n <ns>
kubectl describe challenge -n <ns>
kubectl logs -n cert-manager deploy/cert-manager
```

## Switching from staging to prod issuer

Edit the Ingress annotation: `cert-manager.io/cluster-issuer: letsencrypt-prod`. Delete the existing Secret — cert-manager will re-request.

## Rate limits

LE prod: 50 certs/week per registered domain. HTTP-01 challenges: none per se, but failed challenges accumulate. Always test on LE staging first.
```

- [ ] **Step 6: Write `docs/devops/vault-bootstrap.md`**

Copy §8 from spec. Add KV write examples:

```markdown
## Manual KV write

```bash
kubectl -n infra exec vault-0 -- /bin/sh -c 'VAULT_TOKEN=$(cat /secrets/root) vault kv put secret/companies/acme-co password=xyz'
```

## Security

Unseal keys live in the k8s Secret `vault-unseal-keys` in the `infra` namespace. Anyone with `secrets/get` in that namespace can unseal. For MVP this is acceptable — we accept the trade-off in exchange for operator-free restart recovery. **Future hardening:** move to Vault k8s auth method (apps exchange ServiceAccount JWT for short-lived Vault token) and KMS/HSM auto-unseal.

## Rotating a secret

1. `kubectl -n infra exec vault-0 -- vault kv put secret/<path> <key>=<new-value>`.
2. App must re-read (most apps re-read on connection failure; restart if unsure).
```

- [ ] **Step 7: Write `docs/devops/monitoring.md`**

Copy §9 from spec. Add default Grafana URLs:

```markdown
## Access

- URL: `https://grafana.<env>.dataspace.smartsenselabs.com`
- User: `admin`
- Password: from Vault → `secret/grafana/admin`, key `password`.

## Pre-provisioned dashboards

- Kubernetes Cluster Overview (kube-prometheus-stack default)
- Loki Logs (via Grafana datasource `Loki`, pre-configured)

## Add a custom dashboard

Create a ConfigMap with `grafana_dashboard: "1"` label in the monitoring namespace. The grafana operator auto-imports.
```

- [ ] **Step 8: Write `docs/devops/backups-restore.md`**

Copy §10 from spec. Add restore step-by-step:

```markdown
## Restore Postgres

```bash
# List available backups
ls /data/backups/

# Copy a dump into the postgres pod
DUMP=/data/backups/20260417T020000Z/backend.dump
POD=$(kubectl -n apps get pod -l app.kubernetes.io/name=postgres -o name | head -1)
kubectl -n apps cp "$DUMP" "$POD:/tmp/backend.dump"

# Restore
kubectl -n apps exec "$POD" -- pg_restore --clean --if-exists -U postgres -d backend /tmp/backend.dump
```

## Restore Vault

```bash
# Stop pod
kubectl -n infra scale statefulset vault --replicas=0
# Restore data dir on host
sudo tar xzf /data/backups/vault/vault-20260417.tar.gz -C /
# Restart
kubectl -n infra scale statefulset vault --replicas=1
# Unseal Job runs automatically via helm hook; if not:
./helm/bootstrap.sh <env> vault-unseal
```
```

- [ ] **Step 9: Write `docs/devops/tenant-onboarding.md`**

```markdown
# Adding a new EDC tenant

1. Create tenant values file: `edc/tx-edc-eleven/values-<slug>.yaml`. Copy from `values-template.yaml`, set `participant.id`, `iatp.id`, hostnames, DID.
2. Create Argo Application: `gitops/envs/<env>/tenants/<slug>-edc.yaml`. Copy from `bmw-edc.yaml`, change `name`, `values-<slug>.yaml` reference, and `destination.namespace: edc-<slug>-<env>`.
3. Commit + push. Argo sync picks it up on next reconcile.
4. The provisioning service performs steps 1-3 automatically via its git write-back — this doc is for manual additions.

## Removing a tenant

1. Delete the Application: `kubectl -n argocd delete application edc-<slug>-<env>`.
2. Delete the two files from git and push.
3. Argo prune will reconcile. Verify `kubectl get ns edc-<slug>-<env>` shows Terminating.
```

- [ ] **Step 10: Write `docs/devops/troubleshooting.md`**

```markdown
# Troubleshooting

## Cert stuck in `Pending`

```bash
kubectl describe certificate <name>-tls
```
Look at the Order/Challenge events. Common causes:
- DNS A record missing → LE can't resolve for HTTP-01.
- HAProxy `ingress.class` annotation missing on the Ingress → challenge Ingress not picked up.
- LE rate limit hit (prod) → switch to staging, re-test, switch back.

## Vault sealed after pod restart

The unseal Job runs as a helm post-install hook. On pod restart (no helm upgrade), the Job doesn't re-run. Fix:
```bash
./helm/bootstrap.sh <env> vault-unseal
```

Or force re-unseal:
```bash
kubectl -n infra delete job vault-unseal --ignore-not-found
helm -n infra upgrade --install infra ./helm/infra-chart --reuse-values
```

## Argo Application stuck `OutOfSync`

```bash
kubectl -n argocd get application <name> -o yaml | yq '.status.conditions'
```
Common: subchart version drift (re-run `helm dep update` locally, commit `charts/`), values schema change, webhook not reachable.

## Image Updater not bumping dev

Check: `kubectl -n argocd logs deploy/argocd-image-updater`.
Common: SSH key Secret missing (`argocd-image-updater-ssh`), image tag doesn't match semver regex, ECR unreachable.

## LE staging cert shown as invalid in browser

Expected — LE staging certs are issued by `Fake LE Intermediate X1`, not trusted by browsers. Use staging only for testing the flow; switch annotation to `letsencrypt-prod` once flow works.

## Postgres backup CronJob failing

```bash
kubectl -n apps get cronjob app-chart-postgres-backup
kubectl -n apps logs -l job-name=app-chart-postgres-backup-<suffix>
```
Common: wrong `POSTGRES_PASSWORD` in Secret, hostPath not writable.
```

- [ ] **Step 11: Spell/markdown lint check**

Run:
```bash
find docs/devops -name "*.md" -exec grep -l "TBD\|TODO\|XXX\|FIXME" {} +
```
Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add docs/devops/
git commit -m "docs(devops): full operator documentation set (10 guides)"
```

---

## Phase 9 — Validation

### Task 24: Full dry-run render + kubeval per env

**Files:**
- Create: `scripts/validate-helm.sh` (dev-only helper, not shipped as part of deploy)

- [ ] **Step 1: Write `scripts/validate-helm.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for chart in infra-chart app-chart; do
  helm dep update "helm/$chart" >/dev/null
  for env in dev qa prod; do
    echo ">>> lint $chart @ $env"
    helm lint "helm/$chart" -f "helm/$chart/values.yaml" -f "helm/$chart/values-${env}.yaml"
    echo ">>> template $chart @ $env"
    helm template ci "helm/$chart" \
      -f "helm/$chart/values.yaml" \
      -f "helm/$chart/values-${env}.yaml" \
      --set global.envPrefix="${env}" > "/tmp/${chart}-${env}.yaml"
    echo ">>> kubeval ${chart}-${env}.yaml"
    kubeval --ignore-missing-schemas "/tmp/${chart}-${env}.yaml"
  done
done
echo ">>> gitops manifests"
kubeval --ignore-missing-schemas gitops/bootstrap/*.yaml gitops/envs/*/*.yaml
echo ">>> actionlint"
actionlint .github/workflows/*.yml
echo ">>> shellcheck"
shellcheck helm/bootstrap.sh scripts/validate-helm.sh
echo "ALL CHECKS PASSED"
```

- [ ] **Step 2: Make executable + run**

Run:
```bash
chmod +x scripts/validate-helm.sh
./scripts/validate-helm.sh
```
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 3: Fix any failures inline**

If helm lint reports errors, fix the template/values file that produced them and re-run. Common errors at this stage:
- Missing `.Values.global.envPrefix` → ensure values-<env>.yaml sets it.
- Missing helper definition → check _helpers.tpl has the helper.
- Bad indent in template → verify `nindent` values.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-helm.sh
git commit -m "chore(devops): validate-helm.sh — lint + template + kubeval + actionlint + shellcheck"
```

---

### Task 25: Smoke-test end-to-end in a local `kind` cluster

**Files:** (no new files — operational validation only)

- [ ] **Step 1: Create a local kind cluster**

Run:
```bash
kind create cluster --name japeuhack-dev
```

- [ ] **Step 2: Install infra-chart**

Run:
```bash
helm dep update helm/infra-chart
helm install infra helm/infra-chart \
  --namespace infra --create-namespace \
  -f helm/infra-chart/values.yaml \
  -f helm/infra-chart/values-dev.yaml \
  --set haproxy.controller.daemonset.useHostNetwork=false \
  --wait --timeout 10m
```

Note: `useHostNetwork=false` override because kind uses Docker networking — hostNetwork won't work. This is a smoke-test only; real deploys on kubeadm use hostNetwork.

- [ ] **Step 3: Run vault-init manually**

Run:
```bash
kubectl -n infra exec vault-0 -- vault operator init -format=json -key-shares=5 -key-threshold=3 > /tmp/vault-kind.json
jq '{unseal_key_1: .unseal_keys_b64[0], unseal_key_2: .unseal_keys_b64[1], unseal_key_3: .unseal_keys_b64[2]}' /tmp/vault-kind.json > /tmp/unseal.json
kubectl -n infra create secret generic vault-unseal-keys --from-file=keys.json=/tmp/unseal.json
helm upgrade infra helm/infra-chart --namespace infra --reuse-values --wait
```

- [ ] **Step 4: Confirm Argo is up**

Run:
```bash
kubectl -n argocd get pods
kubectl -n argocd port-forward svc/argocd-server 8080:80 &
```

Open http://localhost:8080 — expect Argo login page.

- [ ] **Step 5: Tear down**

Run:
```bash
kind delete cluster --name japeuhack-dev
rm /tmp/vault-kind.json /tmp/unseal.json
```

- [ ] **Step 6: Record smoke-test result**

Append to `docs/devops/troubleshooting.md` under a new "Known smoke-test deltas" section:

```markdown
## Known smoke-test deltas

- **kind cluster:** use `--set haproxy.controller.daemonset.useHostNetwork=false` because kind's Docker networking doesn't support hostNetwork. Real kubeadm deploys use hostNetwork.
- **local-path-provisioner:** works out of the box on kind (kind uses hostPath internally).
```

- [ ] **Step 7: Commit**

```bash
git add docs/devops/troubleshooting.md
git commit -m "docs(devops): record kind smoke-test deltas"
```

---

### Task 26: Final end-to-end review

**Files:** (no file changes — review only)

- [ ] **Step 1: Verify acceptance criteria from spec §Acceptance Criteria**

Walk through each criterion:

| # | Criterion | Confirmed? |
|---|-----------|-----------|
| 1 | `./helm/bootstrap.sh dev` on fresh kubeadm → cluster working, Argo green, HTTPS valid | manual (requires real server) |
| 2 | Tag `backend-v1.2.3` → image in ECR, values-dev bumped, pod rolled | manual |
| 3 | `gh workflow run promote.yml` opens PR, merge deploys qa | manual |
| 4 | Postgres nightly dump exists, pg_restore works | manual |
| 5 | Vault restart → auto-unseal within 1 min | manual |
| 6 | All 10 docs/devops/*.md exist and internally consistent | ✅ (Task 23) |
| 7 | No `AUTH_ENABLED=false` anywhere | Run check below |
| 8 | No hardcoded secrets in values files | Run check below |

- [ ] **Step 2: Run automated acceptance checks**

Run:
```bash
# No AUTH_ENABLED toggle
if grep -rn "AUTH_ENABLED" helm/ backend/src/ 2>/dev/null | grep -v "CLAUDE.md"; then
  echo "FAIL: AUTH_ENABLED reference found"; exit 1
fi
# No obvious hardcoded passwords in values
if grep -rniE "password[^_][^:]*: +[\"'][^\"']{4,}[\"']" helm/app-chart/values*.yaml helm/infra-chart/values*.yaml; then
  echo "WARN: review any hardcoded passwords above"
fi
# Every Ingress has cert-manager annotation
templated=$(helm template app helm/app-chart/ -f helm/app-chart/values.yaml -f helm/app-chart/values-dev.yaml)
missing=$(echo "$templated" | awk '/kind: Ingress/,/^---/' | grep -c "cluster-issuer" || true)
total=$(echo "$templated"   | grep -c "^kind: Ingress" || true)
echo "Ingresses: $total, with cluster-issuer annotation: $missing"
# Every hostname ends in .dataspace.smartsenselabs.com
if echo "$templated" | grep -E "host:|- [a-z].*\." | grep -v "dataspace.smartsenselabs.com" | grep -v "svc.cluster.local" | grep -v "kubernetes.default.svc" | grep -v "^$"; then
  echo "WARN: hostnames outside dataspace.smartsenselabs.com domain — review above"
fi
echo "ACCEPTANCE CHECKS COMPLETE"
```
Expected: no FAIL lines.

- [ ] **Step 3: Final commit**

No file changes; just mark completion in the plan itself by checking off tasks.

```bash
# No commit needed here — this is the end-of-plan review.
echo "DEVOPS IMPLEMENTATION PLAN COMPLETE."
```

---

## Post-Plan: Hand-off Checklist

When all tasks above are checked off, the deliverables are:

- [x] `helm/infra-chart/` — 8 subchart deps, 4 own templates (LE issuers, vault-unseal, ingresses, image-updater), 3 env values files
- [x] `helm/app-chart/` — renamed from `eu-jap-hack`, Postgres added, backup CronJob, NetworkPolicy, Vault-token wiring, per-env values files
- [x] `gitops/envs/{dev,qa,prod}/` — infra.yaml + app.yaml + tenants/, app-of-apps in `gitops/bootstrap/`
- [x] `.github/workflows/` — `ci.yml`, `release-build.yml`, `promote.yml`; `docker-build-push.yml` deprecated
- [x] `helm/bootstrap.sh` — idempotent bringup, 7 sub-steps
- [x] `helm/bootstrap/vault-mapping.yaml` + `.env.example`
- [x] `docs/devops/` — 10 operator guides
- [x] `scripts/validate-helm.sh` — local validation harness

**Not covered (intentionally, out of scope):**

- Actual deployment to real kubeadm servers (requires server access, DNS, network).
- App code changes (CLAUDE.md invariant).
- Multi-node, HA Postgres/Vault, off-site backups, HSM auto-unseal, secret rotation.
- Keycloak SSO on Argo / Grafana.
- MetalLB, Istio, Alertmanager.

**Next steps after plan completion:**

1. Provision real servers for dev/qa/prod.
2. Run `./helm/bootstrap.sh dev` on dev server → validate full flow end to end.
3. Tag a test release (`backend-v0.1.0`) → verify CI → ECR → Image Updater → Argo sync chain.
4. Once dev is stable, bootstrap qa, then prod.
5. Handover: share `docs/devops/` with the operations team; schedule knowledge-transfer session.
