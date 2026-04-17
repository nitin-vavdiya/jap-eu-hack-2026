# Vault Bootstrap

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

## Manual KV write

```bash
kubectl -n infra exec vault-0 -- /bin/sh -c 'VAULT_TOKEN=$(cat /secrets/root) vault kv put secret/companies/acme-co password=xyz'
```

## Security

Unseal keys live in the k8s Secret `vault-unseal-keys` in the `infra` namespace. Anyone with `secrets/get` in that namespace can unseal. For MVP this is acceptable — we accept the trade-off in exchange for operator-free restart recovery. **Future hardening:** move to Vault k8s auth method (apps exchange ServiceAccount JWT for short-lived Vault token) and KMS/HSM auto-unseal.

## Rotating a secret

1. `kubectl -n infra exec vault-0 -- vault kv put secret/<path> <key>=<new-value>`.
2. App must re-read (most apps re-read on connection failure; restart if unsure).

## MVP token model — note

For simplicity, the current `bootstrap.sh` MVP reuses the Vault **root token** as each app's `VAULT_TOKEN` env var. This keeps the bringup path short (no per-app policy/token creation step), but it means every app has full Vault privileges until this is hardened.

**Follow-up work:** switch to the Vault Kubernetes auth method with per-app AppRoles (or ServiceAccount-JWT login). Each app would then exchange its pod's ServiceAccount token for a short-lived Vault token scoped to its own KV path only (`secret/backend/*`, `secret/companies/*`, etc.). The static-token shape in `values.yaml` (`vaultToken` per app) remains the same — only the source of the token changes.
