# Bootstrap Runbook

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
