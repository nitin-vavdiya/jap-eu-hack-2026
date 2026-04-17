# Self-Managed k8s DevOps Design

**Date:** 2026-04-17
**Status:** DRAFT COMPLETE — all sections drafted, awaiting user review
**Scope:** Deploy entire jap-eu-hack-2026 stack on self-managed kubeadm clusters, no vendor lock-in (ECR exempted per user), single-click umbrella install, GitOps CI/CD for dev/qa/prod.
**Out of scope:** Application code changes.

---

## 0. Decisions Locked In (Q1–Q22)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Registry | AWS ECR Public (keep existing) |
| 2 | Cluster layout | 3 separate single-node kubeadm servers (dev/qa/prod) |
| 3 | DNS | `*.dev.dataspace.smartsenselabs.com`, `*.qa.dataspace.smartsenselabs.com`, `*.prod.dataspace.smartsenselabs.com` |
| 4 | Ingress controller | Official HAProxy Kubernetes Ingress (haproxytech/kubernetes-ingress) |
| 5 | Cert issuer | Let's Encrypt HTTP-01 (per-host, no wildcard, no DNS API creds needed) |
| 6 | Storage | local-path-provisioner (Rancher), dynamic hostPath PVCs |
| 7 | Vault | Prod-mode Vault + file storage + auto-unseal via Job reading k8s Secret holding unseal keys |
| 8 | Secrets flow | App → Vault API direct (transactional); env/non-secret config via ArgoCD-rendered ConfigMaps |
| 9 | GitOps tool | Argo CD |
| 10 | GitOps repo | Same repo, app-of-apps per env |
| 11 | CI release trigger | Per-app git tag `<app>-v<semver>` (e.g. `backend-v1.2.3`) → build + push to ECR |
| 12 | Env promotion | Dev auto (Argo Image Updater) → qa/prod via `workflow_dispatch` opening PR to bump values |
| 13 | CI tests | Unit tests only on PR/merge (integration run locally) |
| 14 | Monitoring | Lightweight: Grafana + Loki + Prometheus (no Alertmanager; prom-operator kept for ServiceMonitor CRDs only) |
| 15 | Backups | CronJob `pg_dump` → hostPath `/data/backups/`, 14-day retention |
| 16 | Node topology | Single-node kubeadm now; values support taints/nodeSelector/tolerations for multi-node future |
| 17 | EDC tenants | Keep per-env; split `gitops/envs/<env>/tenants/` folders |
| 18 | LoadBalancer | HAProxy hostNetwork :80/:443 (single-node). MetalLB deferred. |
| 19 | Postgres | One StatefulSet pod, multiple DBs (`backend`, `keycloak`, `waltid_wallet`) |
| 20 | Argo CD access | Ingress at `argocd.<env>.dataspace...`, admin creds in Vault |
| 21 | Chart split | Two charts: `infra-chart` + `app-chart` (clean lifecycle) |
| 22 | Bootstrap secrets | One-shot `bootstrap.sh` reads local gitignored `.env.<env>`, writes to Vault + k8s Secret for unseal keys |

**Approach chosen:** Approach 1 — Full umbrella from day one. Build everything in one pass, deploy dev → validate → qa → prod.

---

## 1. High-Level Architecture

Three identical single-node kubeadm servers:
- `dev.dataspace.smartsenselabs.com` (DNS `*.dev.dataspace.*`)
- `qa.dataspace.smartsenselabs.com` (DNS `*.qa.dataspace.*`)
- `prod.dataspace.smartsenselabs.com` (DNS `*.prod.dataspace.*`)

Each server = independent cluster. No shared state.

```
Internet
   │  :80/:443
   ▼
┌──────────────────────────────────────────────────────────────┐
│  Kubeadm Single Node (<env>.dataspace.smartsenselabs.com)    │
│                                                              │
│  ┌──────────────────────────┐  ingress class: haproxy        │
│  │ HAProxy Ingress          │◄── hostNetwork :80/:443        │
│  │ (DaemonSet)              │                                │
│  └──────────────────────────┘                                │
│              │                                               │
│   ┌──────────┴─────────────┐                                 │
│   ▼                        ▼                                 │
│  apps namespace     platform namespace                       │
│  ─────────────     ──────────────────                        │
│  backend            postgres (multi-DB)                      │
│  portal-*  (6)      keycloak                                 │
│  provisioning       walt.id wallet/issuer/verifier           │
│                     vault (persistent + auto-unseal)         │
│                     argocd                                   │
│                     cert-manager + letsencrypt issuer        │
│                     haproxy-ingress                          │
│                     local-path-provisioner                   │
│                     prometheus + grafana + loki (monitoring) │
│                                                              │
│  edc namespace per tenant (bmw, toyota…)                     │
│  backups namespace (pg_dump CronJob)                         │
│                                                              │
│  Storage: /data/{postgres,vault,waltid,backups,local-path}   │
└──────────────────────────────────────────────────────────────┘
   │
   │ git pull + app-of-apps
   ▼
  GitHub repo → gitops/envs/<env>/
   │
   │ image pull (ECR Public, anonymous)
   ▼
  public.ecr.aws/<ns>/<app>:<tag>
```

### Traffic flow
Browser → A record (`*.dev.dataspace...` → server IP) → HAProxy (hostNetwork) → Service → Pod.

### Deploy flow
1. Developer tags `backend-v1.2.3` → GitHub Actions builds + pushes ECR.
2. **Dev**: Argo CD Image Updater watches ECR, bumps `values-dev.yaml`, commits PR, merge → Argo sync.
3. **QA/Prod**: `workflow_dispatch` ("promote to qa") opens PR bumping `values-qa.yaml` → approval → merge → Argo sync.

### Data flow
- App → Vault (API) for secrets (DB passwords, wallet creds, operator wallet password, etc.)
- Argo CD → k8s ConfigMap / env vars for non-secret config (URLs, feature flags, BPN).

---

## 2. Repo & Folder Layout

```
jap-eu-hack-2026/
├── helm/
│   ├── infra-chart/                    ← NEW (umbrella infra)
│   │   ├── Chart.yaml                  ← subchart deps
│   │   ├── values.yaml                 ← defaults
│   │   ├── values-dev.yaml
│   │   ├── values-qa.yaml
│   │   ├── values-prod.yaml
│   │   ├── charts/                     ← helm dep up targets
│   │   └── templates/
│   │       ├── letsencrypt-issuer.yaml
│   │       ├── vault-unseal-job.yaml
│   │       ├── vault-init-configmap.yaml
│   │       ├── argocd-ingress.yaml
│   │       └── storageclass-default.yaml
│   │
│   ├── app-chart/                      ← RENAMED from eu-jap-hack
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   ├── values-dev.yaml
│   │   ├── values-qa.yaml
│   │   ├── values-prod.yaml
│   │   ├── configs/keycloak/
│   │   └── templates/
│   │       ├── backend-*.yaml          (retained)
│   │       ├── portal-*.yaml
│   │       ├── keycloak-*.yaml
│   │       ├── provisioning-*.yaml
│   │       ├── waltid-*.yaml
│   │       ├── postgres-statefulset.yaml      ← NEW
│   │       ├── postgres-service.yaml          ← NEW
│   │       ├── postgres-backup-cronjob.yaml   ← NEW
│   │       ├── vault-secretstore.yaml         ← NEW (optional ESO)
│   │       └── networkpolicy.yaml             ← NEW
│   │
│   └── bootstrap.sh                    ← one-shot cluster prep (kubeadm → argo ready)
│
├── edc/tx-edc-eleven/                  ← EXISTING, unchanged
│   └── values-<tenant>.yaml
│
├── gitops/
│   ├── bootstrap/                      ← NEW: root Argo app per env
│   │   ├── app-of-apps-dev.yaml
│   │   ├── app-of-apps-qa.yaml
│   │   └── app-of-apps-prod.yaml
│   └── envs/
│       ├── dev/
│       │   ├── infra.yaml              (Argo Application → infra-chart)
│       │   ├── app.yaml                (Argo Application → app-chart)
│       │   ├── monitoring.yaml
│       │   └── tenants/
│       │       ├── bmw-edc.yaml
│       │       └── …
│       ├── qa/
│       └── prod/
│
├── .github/workflows/
│   ├── ci.yml                          ← NEW: unit tests on PR/main
│   ├── release-build.yml               ← NEW: tag-triggered ECR push
│   └── promote.yml                     ← NEW: workflow_dispatch qa/prod
│
└── docs/devops/                        ← NEW
    ├── README.md
    ├── architecture.md
    ├── bootstrap-runbook.md
    ├── ci-cd.md
    ├── tls-ingress.md
    ├── vault-bootstrap.md
    ├── monitoring.md
    ├── backups-restore.md
    ├── tenant-onboarding.md
    └── troubleshooting.md
```

**Key moves:**
- `helm/eu-jap-hack/` → renamed `helm/app-chart/`
- `gitops/applications/*.yaml` → `gitops/envs/dev/tenants/*.yaml`
- EDC chart unchanged
- `build-and-push.sh` to be superseded by GHA workflows (kept for local use)

---

## 3. `infra-chart` Contents

### Subchart dependencies (`Chart.yaml`)

```yaml
dependencies:
  - name: haproxy-kubernetes-ingress
    version: ~1.41.x
    repository: https://haproxytech.github.io/helm-charts
    condition: haproxy.enabled

  - name: cert-manager
    version: v1.16.x
    repository: https://charts.jetstack.io
    condition: certManager.enabled

  - name: local-path-provisioner
    version: 0.0.x
    repository: https://charts.containeroo.ch
    condition: localPath.enabled

  - name: vault
    version: ~0.28.x
    repository: https://helm.releases.hashicorp.com
    condition: vault.enabled

  - name: argo-cd
    version: ~7.x
    repository: https://argoproj.github.io/argo-helm
    condition: argocd.enabled

  - name: kube-prometheus-stack
    version: ~65.x
    repository: https://prometheus-community.github.io/helm-charts
    condition: monitoring.prom.enabled

  - name: loki
    version: ~6.x
    repository: https://grafana.github.io/helm-charts
    condition: monitoring.loki.enabled

  - name: promtail
    version: ~6.x
    repository: https://grafana.github.io/helm-charts
    condition: monitoring.promtail.enabled
```

### Own templates

| Template | Purpose |
|----------|---------|
| `letsencrypt-issuer.yaml` | `ClusterIssuer` for LE HTTP-01 via HAProxy class. Per env: staging + prod issuers. |
| `vault-unseal-job.yaml` | Post-install Job: reads unseal keys from k8s Secret `vault-unseal-keys`, calls `vault operator unseal` ×3. Re-runs on pod restart via helm hook. |
| `vault-init-configmap.yaml` | First-time init script (records unseal keys to Secret) — disabled by default, one-time use. |
| `argocd-ingress.yaml` | HAProxy Ingress for Argo UI at `argocd.<env>.dataspace...`. |
| `storageclass-default.yaml` | Marks local-path as default SC. |

### Values shape (`infra-chart/values.yaml`)

```yaml
global:
  domain: dataspace.smartsenselabs.com
  envPrefix: dev                # dev|qa|prod — used to build hosts

haproxy:
  enabled: true
  controller:
    kind: DaemonSet
    daemonset:
      useHostNetwork: true
      hostPorts: { http: 80, https: 443, stat: 1024 }
  ingressClass: haproxy

certManager:
  enabled: true
  installCRDs: true
  issuers:
    letsencryptHttp01Prod:
      enabled: true
      email: devops@smartsenselabs.com

localPath:
  enabled: true
  isDefault: true
  hostPath: /data/local-path

vault:
  enabled: true
  server:
    standalone:
      enabled: true
      config: |
        storage "file" { path = "/vault/data" }
        listener "tcp" { address = "0.0.0.0:8200" tls_disable = 1 }
        ui = true
    dataStorage:
      enabled: true
      size: 5Gi
      storageClass: local-path
  unseal:
    enabled: true              # runs unseal Job from k8s Secret

argocd:
  enabled: true
  server:
    ingress:
      enabled: true
      ingressClassName: haproxy
      hostname: argocd         # full = argocd.<env>.<domain>
      annotations:
        cert-manager.io/cluster-issuer: letsencrypt-prod
  configs:
    params:
      server.insecure: true    # TLS terminated at HAProxy

monitoring:
  prom:
    enabled: true
    alertmanager: { enabled: false }
    grafana:
      ingress:
        enabled: true
        hostname: grafana
      persistence: { enabled: true, storageClass: local-path, size: 2Gi }
  loki:
    enabled: true
    deploymentMode: SingleBinary
    loki:
      storage: { type: filesystem }
    persistence: { enabled: true, storageClass: local-path, size: 10Gi }
  promtail:
    enabled: true
```

---

## 4. `app-chart` Contents

### Templates

| Template | Status | Notes |
|----------|--------|-------|
| `backend-deployment/service/ingress/secret` | existing | Add Vault-token envFrom; remove `AUTH_ENABLED` (CLAUDE.md says auth is always on); resource limits from env values |
| `portal-deployment/service/ingress` | existing | Loop over `.Values.portals` (6 entries) — DRY refactor |
| `keycloak-deployment/service/ingress/secret` | existing | Switch DB from H2 → Postgres |
| `provisioning-deployment/service/secret` | existing | Vault client config, ingress added |
| `waltid-configmap/deployment/service/ingress` | existing | PVC added for wallet-api (`/waltid-wallet-api/data`) |
| `postgres-statefulset.yaml` | NEW | 1 replica, PVC 20Gi local-path. Init container creates 3 DBs with scoped users. Passwords from Vault via envFrom. |
| `postgres-service.yaml` | NEW | ClusterIP |
| `postgres-backup-cronjob.yaml` | NEW | Daily `pg_dump -Fc --clean` all 3 DBs → `/data/backups/<date>/*.dump`. hostPath mount. 14-day retention via `find -mtime`. |
| `vault-secretstore.yaml` | NEW (optional) | SecretStore + ExternalSecrets for pulling bootstrap secrets from Vault into k8s Secret (Keycloak admin, Postgres passwords). |
| `networkpolicy.yaml` | NEW | Deny-all ingress default, allow haproxy → apps namespace. |

### Values shape (`app-chart/values.yaml`)

```yaml
global:
  imageRegistry: public.ecr.aws/<namespace>
  imagePullSecrets: []            # ECR Public = anonymous pulls
  domain: dataspace.smartsenselabs.com
  envPrefix: dev

ingress:
  className: haproxy
  clusterIssuer: letsencrypt-prod
  tls: true

postgres:
  enabled: true
  image: postgres:16-alpine
  storage: { size: 20Gi, storageClass: local-path, hostPath: /data/postgres }
  databases:
    - { name: backend, user: backend }
    - { name: keycloak, user: keycloak }
    - { name: waltid_wallet, user: waltid }

backend:
  replicaCount: 1
  image: { repository: backend, tag: latest, pullPolicy: IfNotPresent }
  ingress: { subdomain: api }        # → api.dev.dataspace...
  env:                                # non-secret only; secrets via Vault
    DATABASE_URL: "postgresql://backend@eu-jap-app-postgres:5432/backend"
    WALTID_WALLET_URL: "http://eu-jap-app-waltid-wallet:7001"
    VAULT_ADDR: "http://vault.platform.svc.cluster.local:8200"
    # …
  resources:
    requests: { cpu: 200m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

portals:
  dataspace:    { subdomain: portal-dataspace,   image: portal-dataspace }
  tataAdmin:    { subdomain: portal-admin,       image: portal-tata-admin }
  tataPublic:   { subdomain: portal-public,      image: portal-tata-public }
  wallet:       { subdomain: portal-wallet,      image: portal-wallet }
  insurance:    { subdomain: portal-insurance,   image: portal-insurance }
  company:      { subdomain: portal-company,     image: portal-company }

keycloak:
  image: { repository: keycloak, tag: latest }
  ingress: { subdomain: auth }
  db:
    vendor: postgres
    host: eu-jap-app-postgres
    database: keycloak
    username: keycloak
  admin:
    username: admin
    passwordSecret: { name: keycloak-admin, key: password }

waltid:
  wallet:   { image: waltid/wallet-api,   pvc: { size: 2Gi } }
  issuer:   { image: waltid/issuer-api }
  verifier: { image: waltid/verifier-api }

provisioning:
  image: { repository: provisioning, tag: latest }
  ingress: { subdomain: provisioning }

backup:
  enabled: true
  schedule: "0 2 * * *"
  retentionDays: 14
  hostPath: /data/backups

# Multi-node future support
nodeSelector: {}
tolerations: []
affinity: {}
```

### Hostnames per env

Derived as `<subdomain>.<envPrefix>.<domain>`:

- dev: `api.dev.dataspace.smartsenselabs.com`, `portal-admin.dev.dataspace...`, `auth.dev.dataspace...`, `argocd.dev.dataspace...`, `grafana.dev.dataspace...`
- qa: `api.qa.dataspace.smartsenselabs.com`, …
- prod: `api.prod.dataspace.smartsenselabs.com`, …

---

## 5. GitOps / Argo CD Structure

**App-of-apps per env:**

```
gitops/
├── bootstrap/
│   ├── app-of-apps-dev.yaml
│   ├── app-of-apps-qa.yaml
│   └── app-of-apps-prod.yaml
└── envs/
    ├── dev/
    │   ├── infra.yaml          # Argo App → helm/infra-chart + values-dev.yaml
    │   ├── app.yaml            # Argo App → helm/app-chart  + values-dev.yaml
    │   └── tenants/
    │       ├── bmw-edc.yaml
    │       └── toyota-motor-belgium-edc.yaml
    ├── qa/
    └── prod/
```

**Root `app-of-apps-<env>.yaml`** recurses `gitops/envs/<env>/`, picks up every Application. Automated sync (prune + selfHeal) on dev/qa; manual on prod.

**Child `app.yaml` (dev)** annotated for Argo CD Image Updater:
- `argocd-image-updater.argoproj.io/image-list` — all 7 images (backend + 6 portals; keycloak uses upstream image)
- `write-back-method: git`, `update-strategy: semver`
- Commits bump to `values-dev.yaml` on new ECR tag

**Sync policy matrix:**

| Env  | infra.yaml | app.yaml | tenants/* |
|------|-----------|----------|-----------|
| dev  | auto + selfHeal + prune | auto + **Image Updater ON** | auto |
| qa   | auto + selfHeal | auto, Image Updater OFF (promote via workflow_dispatch PR) | manual sync |
| prod | **manual sync**, selfHeal on | manual sync, Image Updater OFF | manual sync |

**Image Updater**: sidecar in `argocd` ns, enabled on dev Applications only. Git write-back uses a dedicated SSH deploy key (stored in k8s Secret `argocd-image-updater-ssh`, populated from Vault at bootstrap).

**Repo creds**: public repo, no pull creds. Write-back requires SSH deploy key with write scope on `jap-eu-hack-2026` repo.

**Per-tenant EDC Applications**: same shape as existing `gitops/applications/*.yaml`, moved to `gitops/envs/<env>/tenants/`. Provisioning service generates + commits `<slug>-edc.yaml` on tenant onboarding. App-of-apps picks it up on reconcile.

**Sync waves** (Argo annotation `argocd.argoproj.io/sync-wave`):
- `-1` infra (haproxy, cert-manager, vault, local-path, argocd itself bootstraps separately)
- `0` app (postgres → keycloak + backend + portals + waltid)
- `1` tenants (depend on backend + provisioning ready)

---

## 6. CI/CD Pipelines

Three workflows replace the single existing `docker-build-push.yml`:

### `ci.yml` — on PR + push to main
- Node 20 setup → `npm ci` → `npm test` (Jest unit tests only).
- No docker build, no ECR push.
- Fails if tests fail.

### `release-build.yml` — on tag `refs/tags/<app>-v*`
- Parse tag: `backend-v1.2.3` → `app=backend`, `version=1.2.3`.
- Lookup table: `app` → Dockerfile path + build context + build args.
  - `backend` → `backend/Dockerfile`
  - `portal-<name>` → `apps/Dockerfile` with `APP_NAME=portal-<name>`
  - `keycloak` → `keycloak/Dockerfile`
  - `provisioning` → `provisioning/Dockerfile`
- Configure AWS creds → ECR Public login → `docker buildx` multi-arch (amd64 + arm64) → push `public.ecr.aws/<ns>/<app>:<version>` and `:latest`.
- Authorization: same `ALLOWED_ACTORS` gate as current workflow (actor must be in allowlist).
- Post-push: open PR bumping `helm/app-chart/values-dev.yaml` at `<app>.image.tag = <version>` (redundant fallback/audit trail alongside Argo Image Updater).

### `promote.yml` — `workflow_dispatch`
Inputs: `env` (`qa|prod`), `app`, `version`.
- Validate: image tag exists in ECR.
- Open PR bumping `helm/app-chart/values-<env>.yaml`.
- PR title: `promote(<env>): <app> → <version>`.
- Merge → Argo syncs that env.

### Tag convention
`<app>-v<semver>`. Valid apps: `backend`, `portal-dataspace`, `portal-tata-admin`, `portal-tata-public`, `portal-wallet`, `portal-insurance`, `portal-company`, `keycloak`, `provisioning`.

### Secrets
**Retained:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REGISTRY`, `ECR_NAMESPACE`, `ALLOWED_ACTORS`.
**New:** `GH_PAT_VALUES_WRITE` — PAT with `contents:write` + `pull-requests:write` scope on this repo, used by bump-PR steps.

### Deprecation
Existing `docker-build-push.yml` kept for one release cycle (fallback), then deleted.

---

## 7. TLS / Ingress / Cert-Manager

- **HAProxy Ingress**: DaemonSet, hostNetwork, binds node `:80` + `:443`. IngressClass `haproxy`.
- **cert-manager**: two `ClusterIssuer`s per cluster — `letsencrypt-staging` + `letsencrypt-prod`. Both HTTP-01 with `solvers.http01.ingress.class: haproxy`. Use staging on dev first to avoid LE rate limits; switch to prod once issuance flow is verified.
- Every Ingress annotated `cert-manager.io/cluster-issuer: letsencrypt-prod` with `tls.hosts` per host. **One cert per hostname** (no wildcard — HTTP-01 cannot issue wildcards).
- **Renewal**: automatic at 30d remaining (cert-manager default). No operator action.
- **Hostname templating**: `_helpers.tpl` has `app-chart.ingressHost <subdomain>` which returns `<subdomain>.<global.envPrefix>.<global.domain>`.
- **DNS**: A records for every hostname → server IP (wildcard `*.<env>.dataspace.smartsenselabs.com` preferred; fall back to explicit per-host A records if registrar doesn't support wildcards).

---

## 8. Vault Setup & Secrets Flow

### Init (one-time per cluster)
1. Vault boots sealed, file backend on `/vault/data` (5Gi local-path PVC).
2. Operator runs `bootstrap.sh vault-init` →
   `kubectl exec vault-0 -- vault operator init -key-shares=5 -key-threshold=3`.
3. Script captures 5 unseal keys + root token → writes to k8s Secrets `vault-unseal-keys` and `vault-root-token` in `vault` namespace (RBAC-restricted to `vault-unseal` ServiceAccount).
4. Root token printed once to operator terminal — **must be recorded offline**. The Secret is a convenience for auto-unseal, not a replacement.

### Auto-unseal
- Job `vault-unseal` runs as Helm post-install hook + pod-startup hook (initContainer sidecar model): reads Secret, runs `vault operator unseal` ×3 on every Vault pod restart.

### Tradeoff (explicit)
Unseal keys in k8s Secret = anyone with cluster admin can unseal → weaker than HSM/cloud-KMS auto-unseal. Acceptable for MVP per goal ("dev-like auto-unseal"). Documented in `docs/devops/vault-bootstrap.md` §Security.

### KV structure (`secret/` mount, KVv2)
```
secret/
├── operator/wallet          # OPERATOR_WALLET_PASSWORD etc.
├── companies/<companyId>    # per-company wallet creds
├── postgres/<db>            # backend, keycloak, waltid_wallet
├── keycloak/admin           # admin password
├── backend/misc             # API keys, shared tokens
└── provisioning/callback    # PROVISIONING_CALLBACK_SECRET
```

### App access
**MVP**: static Vault token per app in k8s Secret `<app>-vault-token`, mounted as `VAULT_TOKEN` env var. Token scoped via Vault policy to its own KV path only.
**Future (out of scope)**: Vault k8s auth method — pods auth via ServiceAccount JWT. Noted in `vault-bootstrap.md` §Future hardening.

### Populating secrets
`bootstrap.sh populate-vault --env <env>` reads gitignored `.env.<env>` and writes via `vault kv put secret/<path> key=value`, driven by mapping file `helm/bootstrap/vault-mapping.yaml`.

### Rotation
Out of scope for MVP. Documented as future work.

---

## 9. Monitoring Stack

- **Prometheus** (kube-prometheus-stack chart): Alertmanager OFF, operator ON for `ServiceMonitor` CRDs only. Scrapes kube-state-metrics, node-exporter, haproxy-ingress, vault telemetry.
- **Grafana**: Ingress `grafana.<env>.dataspace...`, persistence 2Gi local-path, admin password from Vault (`secret/grafana/admin`).
- **Loki** single-binary mode, filesystem storage, 10Gi local-path PVC, 7d retention.
- **Promtail** DaemonSet scrapes all pod logs.
- **Dashboards** provisioned via ConfigMap: `kubernetes-cluster`, `postgres` (needs `postgres_exporter` sidecar), `vault`, `haproxy-ingress`.
- **Backend metrics**: `ServiceMonitor` added if/when backend exposes `/metrics`; skipped otherwise (app code change out of scope).

---

## 10. Backups & Restore

### Postgres
- CronJob `postgres-backup` in `apps` ns, schedule `0 2 * * *`.
- Image `postgres:16-alpine`, runs `pg_dump -Fc --clean` per DB → `/backups/<date>/<db>.dump`.
- hostPath mount `/data/backups` (node-local).
- Retention: pre-run `find /backups -type d -mtime +14 -exec rm -rf {} +`.

### Vault
- File storage backed up nightly via `tar czf vault-<date>.tar.gz /vault/data` CronJob → `/data/backups/vault/`.
- **Restore requires same unseal keys** — operator must keep keys offline (printed during `vault-init`).

### Restore runbook (`docs/devops/backups-restore.md`)
- **Postgres**: `kubectl cp <dump> postgres-0:/tmp/`, then `pg_restore --clean --if-exists -d <db> /tmp/<db>.dump`.
- **Vault**: stop pod, replace `/vault/data` from tarball, start pod, unseal Job auto-runs.

### Out of scope
Off-site / S3 backup (hostPath only, single-node limitation). Documented as future work.

---

## 11. Bootstrap Runbook & Single-Click Install

### `helm/bootstrap.sh` — idempotent, rerunnable

```
bootstrap.sh <env> [step]
  steps (runs all by default, or one by name):
    prereq           verify kubectl, helm, kubeadm, DNS, /data dirs
    infra            helm dep update && helm install infra ./helm/infra-chart -f values-<env>.yaml
    vault-init       if sealed & uninitialized, init + store unseal keys/root token in k8s Secret
    vault-unseal     apply unseal Job
    vault-populate   populate KV from .env.<env> via vault-mapping.yaml
    argocd-login     print initial admin password
    app-of-apps      kubectl apply gitops/bootstrap/app-of-apps-<env>.yaml
    verify           wait for all Argo Applications Healthy + Synced
```

### Prereqs (`docs/devops/bootstrap-runbook.md`)
1. Ubuntu 22.04+ server, 8 vCPU / 16GB RAM / 100GB disk.
2. `kubeadm init` single-node; untaint control-plane:
   `kubectl taint nodes --all node-role.kubernetes.io/control-plane-`.
3. CNI: Calico (NetworkPolicy support).
4. Host dirs: `mkdir -p /data/{postgres,vault,waltid,backups,local-path}`.
5. DNS A records for `*.<env>.dataspace.smartsenselabs.com` → server IP.
6. Clone repo, copy `.env.<env>.example` → `.env.<env>`, fill secrets.
7. Run `./helm/bootstrap.sh <env>`.
8. Open `argocd.<env>.dataspace...`, verify all green.

### Docs folder (`docs/devops/`)
- `README.md` — index + architecture diagram
- `architecture.md` — §1 expanded
- `bootstrap-runbook.md` — §11
- `ci-cd.md` — §6
- `tls-ingress.md` — §7
- `vault-bootstrap.md` — §8
- `monitoring.md` — §9
- `backups-restore.md` — §10
- `tenant-onboarding.md` — how to add a new EDC tenant
- `troubleshooting.md` — cert pending, vault sealed, Argo out-of-sync, LE rate limits

### Teardown / DR
Documented in `bootstrap-runbook.md` §Teardown and §Disaster Recovery (rebuild flow: fresh kubeadm → run bootstrap → restore Postgres dump + Vault tarball).

---

## Acceptance Criteria

- `./helm/bootstrap.sh dev` on a fresh kubeadm server brings up a fully working cluster with infra + app + tenants, Argo UI green, HTTPS valid on all Ingresses.
- Developer tagging `backend-v1.2.3` → image in ECR within ~10 min, dev values-dev.yaml bumped by Image Updater, backend pod rolled.
- `gh workflow run promote.yml -f env=qa -f app=backend -f version=1.2.3` opens a PR; merging deploys to qa.
- Postgres nightly dump exists at `/data/backups/<date>/` on dev server; `pg_restore` from dump works per runbook.
- Vault restart → auto-unseal Job runs → apps reconnect within 1 min.
- All 10 docs in `docs/devops/` exist and are internally consistent.
- No `AUTH_ENABLED=false` anywhere (CLAUDE.md invariant).
- No hardcoded secrets in values files; all secrets read from Vault or k8s Secret (Vault-backed).

## Out of Scope

- Application code changes.
- Multi-node kubeadm (values support it, but not deployed).
- HA Vault / Postgres (single replica each).
- Off-site backups.
- HSM / cloud-KMS Vault auto-unseal.
- Vault k8s auth method (MVP uses static tokens).
- Secret rotation.
- Keycloak SSO for Argo / Grafana (admin creds only).
- Istio / service mesh.
- Alertmanager + on-call paging.
