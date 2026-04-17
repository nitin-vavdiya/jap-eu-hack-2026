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
