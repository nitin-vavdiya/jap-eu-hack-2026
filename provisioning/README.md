# EDC Provisioning Service

Internal microservice that provisions a dedicated Eclipse Dataspace Connector (EDC) instance for each onboarded company, including its own isolated PostgreSQL database.

> **Network access**: This service has **no public ingress**. It is only reachable from within the Kubernetes cluster (or via local port-forward for development). Only the main backend service should call it.

---

## Architecture

Each company gets a fully isolated stack deployed in its own Kubernetes namespace (`edc-{tenantCode}`):

```
edc-{tenantCode} namespace
├── EDC Control Plane      (tractusx/edc-controlplane-postgresql-hashicorp-vault)
├── EDC Data Plane         (tractusx/edc-dataplane-hashicorp-vault)
└── PostgreSQL             (Bitnami subchart — dedicated per tenant)
```

All resources are managed by a single **Argo CD Application** per company (`edc-{tenantCode}`), deployed via Helm from `edc/tx-edc-eleven`. The Bitnami PostgreSQL subchart (`install.postgresql: true`) is deployed alongside EDC in the same namespace and release — no shared external database.

---

## What it does

When a company is onboarded, the backend triggers `POST /provision`. The service then:

1. Writes **secrets to HashiCorp Vault** (KV v2) — the PostgreSQL password and EDC Vault token — at a tenant-scoped path.
2. Renders a **per-tenant Helm values file** (`edc/tx-edc-eleven/values-{tenantCode}.yaml`) from the Handlebars template.
3. Commits the values file + an **Argo CD Application manifest** (`gitops/applications/{tenantCode}-edc.yaml`) to the git repository and pushes.
4. Calls back the **backend API** to update the `edc_provisioning` record with final URLs and status.

Argo CD picks up the new Application manifest (auto-sync, ~3 min poll or immediate trigger) and deploys the full stack — EDC + PostgreSQL — into the company namespace.

All steps are **idempotent** — re-triggering provisioning will not create duplicate resources.

---

## Per-tenant resources (Kubernetes)

| Resource | Name pattern | Namespace |
|---|---|---|
| Namespace | `edc-{tenantCode}` | — |
| Argo CD Application | `edc-{tenantCode}` | `argocd` |
| Helm release | `edc-{tenantCode}` | `edc-{tenantCode}` |
| PostgreSQL StatefulSet | `edc-{tenantCode}-postgresql` | `edc-{tenantCode}` |
| PostgreSQL Service | `edc-{tenantCode}-postgresql` | `edc-{tenantCode}` |
| PostgreSQL database | `edc_{tenantCode}` (hyphens → underscores) | — |
| PostgreSQL user | `edc_{tenantCode}` | — |
| Vault secret path | `k8s-stack/data/tx_edc_connector_{tenantCode}` | — |

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```
PORT=3001
BACKEND_URL=http://backend-service.default.svc.cluster.local:3000

VAULT_ADDR=http://vault.vault.svc.cluster.local:8200
VAULT_TOKEN=<vault-provisioning-token>

GIT_REPO_PATH=/repo
GIT_REMOTE_URL=https://github.com/smartSenseSolutions/jap-eu-hack-2026
GIT_AUTH_TOKEN=<github-pat>
GIT_USER_NAME=edc-provisioning-bot
GIT_USER_EMAIL=edc-provisioning@the-sense.io
GIT_REPO_URL=https://github.com/smartSenseSolutions/jap-eu-hack-2026

ARGOCD_SERVER_URL=http://argocd-server.argocd.svc.cluster.local   # optional
ARGOCD_AUTH_TOKEN=<argocd-api-token>                                # optional
```

> `POSTGRES_ADMIN_URL` is no longer required — PostgreSQL is provisioned by Helm as a subchart, not by this service.

---

## Required permissions

### HashiCorp Vault

The service uses a **static Vault token** (`VAULT_TOKEN`) injected as a Kubernetes Secret.

The token must be associated with a policy that allows:

```hcl
# Allow write/read to all tenant EDC connector secret paths
path "k8s-stack/data/tx_edc_connector_*" {
  capabilities = ["create", "update", "read"]
}

path "k8s-stack/metadata/tx_edc_connector_*" {
  capabilities = ["list", "read"]
}
```

**KV engine requirements:**
- Mount name: `k8s-stack`
- Engine version: **KV v2**
- If the mount does not exist: `vault secrets enable -version=2 -path=k8s-stack kv`

**Create the policy and token:**
```bash
# Create policy file provisioning-policy.hcl with the content above, then:
vault policy write edc-provisioning provisioning-policy.hcl
vault token create -policy=edc-provisioning -ttl=0 -display-name=edc-provisioning
```

**Secrets written per tenant** (`k8s-stack/data/tx_edc_connector_{tenantCode}`):

| Key | Value |
|---|---|
| `dbpass` | Random 24-byte base64url password for the tenant's PostgreSQL user |
| `vault-token` | Vault token used by the EDC connector itself |

The Helm chart references these via Vault AVP syntax (`<path:...#key>`). DB host, name, and user are deterministic from `tenantCode` and do not need to be stored in Vault.

---

### GitHub (Git repository access)

The service needs to commit and push to the repository to add:
- `edc/tx-edc-eleven/values-{tenantCode}.yaml`
- `gitops/applications/{tenantCode}-edc.yaml`

**Recommended: Fine-grained Personal Access Token (PAT)**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Select the `jap-eu-hack-2026` repository
3. Grant **Contents → Read and Write**
4. Set token expiry according to your rotation policy
5. Store the token in `GIT_AUTH_TOKEN`

---

### Argo CD (optional — for immediate sync)

Without Argo CD credentials, the service still works — Argo CD auto-sync picks up the new Application manifest within ~3 minutes (default poll interval).

To enable **immediate sync**, provide `ARGOCD_SERVER_URL` and `ARGOCD_AUTH_TOKEN`.

**Create a dedicated Argo CD account:**

```bash
# In argocd-cm ConfigMap, add:
# accounts.edc-provisioning: apiKey

# Generate a token:
argocd account generate-token --account edc-provisioning
```

**RBAC policy** (add to `argocd-rbac-cm` ConfigMap):
```
p, role:edc-provisioner, applications, sync, default/edc-*, allow
g, edc-provisioning, role:edc-provisioner
```

**Argo CD App-of-Apps setup** (required for auto-detection of `gitops/applications/`):

Create a root Argo CD Application that watches the `gitops/applications/` directory in this repo. Any `.yaml` file added there will be treated as an Argo CD Application resource:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: edc-tenants-root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/smartSenseSolutions/jap-eu-hack-2026
    targetRevision: HEAD
    path: gitops/applications
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Apply once: `kubectl apply -f edc-tenants-root.yaml -n argocd`

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/provision` | Trigger provisioning for a company. Body: `{companyId, tenantCode, bpn}`. Returns 202 immediately; runs async. |
| `GET` | `/status/:companyId` | Quick check if provisioning is currently running. For full status, call the backend. |
| `GET` | `/health` | Health check. Returns `{status: "ok"}`. |

---

## Local development

```bash
cd provisioning
npm install

# Port-forward cluster services locally
kubectl port-forward svc/vault -n vault 8200:8200 &

# Set env vars
cp .env.example .env
# Edit .env with local values, set GIT_REPO_PATH to local repo root

npm run dev
```

---

## Running in Kubernetes

The service should be deployed as a Kubernetes `Deployment` with:
- **No `Ingress` resource** — internal ClusterIP service only
- Environment variables sourced from a `Secret` (not ConfigMap) for tokens and passwords
- The git repository mounted as a volume (or cloned on startup via init container)
- `GIT_REPO_PATH` pointing to the mounted/cloned repo root

Example Service (internal only):
```yaml
apiVersion: v1
kind: Service
metadata:
  name: provisioning-service
spec:
  type: ClusterIP    # No LoadBalancer or NodePort
  selector:
    app: edc-provisioning
  ports:
    - port: 3001
      targetPort: 3001
```

---

## Provisioning flow

```
POST /provision
  │
  ├─ Step 0: callback → status: "provisioning"
  ├─ Step 1: Vault KV v2 write → k8s-stack/data/tx_edc_connector_{code}
  │           Keys: dbpass (random), vault-token
  ├─ Step 2: Render values-template.yaml → values-{code}.yaml
  │           PostgreSQL: install.postgresql=true, in-cluster subchart,
  │           jdbcUrl: edc-{code}-postgresql:5432/edc_{code}
  ├─ Step 3: git add + commit + push (skip if no diff)
  │           Files: values-{code}.yaml + gitops/applications/{code}-edc.yaml
  │           └─ optional: Argo CD API sync trigger
  │
  └─ Step 4: callback → status: "ready" | "failed"
              ArgoCD then deploys: EDC + PostgreSQL into namespace edc-{code}
```

On failure at any step, the backend record is updated with `status: "failed"` and `lastError`. Re-sending `POST /provision` with the same payload retries all steps safely.
