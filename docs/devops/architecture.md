# Architecture

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
