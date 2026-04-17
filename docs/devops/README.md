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
