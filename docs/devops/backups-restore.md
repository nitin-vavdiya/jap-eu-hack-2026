# Backups & Restore

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
