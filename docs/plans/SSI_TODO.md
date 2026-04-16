# SSI Implementation — Remaining TODO

**Last updated:** 2026-04-16  
**Context:** Per-company wallet SSI architecture is largely implemented. This file tracks what remains before the first milestone is complete.

---

## High Priority

### 1. Fix `/wallet/credentials` — returns wrong wallet
**File:** `backend/src/routes/org-credentials.ts` (line ~289, ~294)

`listWalletCredentials()` is called without a company wallet context — it returns operator wallet credentials (or fails). The endpoint should proxy the **company's** wallet using the company's session.

**Fix needed:**
- Accept `companyId` as a query param or derive from auth context
- Call `getCompanyWalletContext(companyId)` → pass `session` + `walletId` to `listWalletCredentials`

---

### 2. Verify operator bootstrap idempotency
After today's container restart + stale row deletion, the operator wallet will be re-provisioned on next backend start.

**Verify:**
```bash
# Start backend — watch for:
# "Operator walt.id wallet provisioned and recorded"

# Then restart backend again — must NOT create a second operator wallet account:
# "Operator wallet already recorded — skipping bootstrap"

# Confirm Vault was written:
curl -s -H "X-Vault-Token: dev-root-token" \
  http://localhost:8200/v1/secret/data/operator/wallet | jq .data.data
```

---

## Medium Priority

### 3. Remove `waltid.ts` monolith
**File:** `backend/src/services/waltid.ts`

Per plan Phase 7 — logic should live under `services/wallet/`. Currently still used for `listWalletCredentials` and `SimpleWalletCredential` type.

**Steps:**
1. Move `listWalletCredentials` into `wallet-api-client.ts` (or `company-wallet-service.ts`)
2. Update all import sites
3. Delete `waltid.ts`

---

### 4. Check/delete `backend/.keys/` directory
Per plan Phase 7 — the old platform keypair filesystem store should no longer exist.

```bash
ls backend/.keys/ 2>/dev/null && echo "EXISTS — delete it" || echo "Already gone"
```

---

### 5. ADR status → Accepted
**File:** `docs/adr/002-per-company-wallet-ssi-architecture.md`

Change `Status: Proposed` → `Status: Accepted` now that the implementation is in place and spikes are resolved.

---

## Known Limitations (deferred, documented)

### ComplianceVC not stored in wallet
The Gaia-X ComplianceVC is issued and signed by GXDCH — it cannot be re-signed with the company key, and the Community Stack has no `/credentials/import` endpoint (confirmed through v0.19.0). The N1 deviation and rationale are recorded in `docs/agreements/001-ssi-implementation-agreement.md §6.4`.

**Unblock path:** Either (a) upgrade to walt.id Enterprise which has direct import, or (b) deploy a signing-proxy sidecar. Both deferred.

---

## Low Priority / Docs

### 6. Create PRD
**File:** `docs/prd/001-ssi-per-company-wallet.md`

Promote `docs/brainstorms/per-company-wallet-ssi-requirements.md` into a formal PRD (see plan Phase 1a for structure).

### 7. Write tests
No wallet flow tests exist. Minimum coverage needed:
- Company wallet provisioning (mocked walt.id)
- DID document serves company-specific JWKs (snapshot test)
- Operator bootstrap idempotency (mocked Vault + walt.id)

---

## Verification Checklist (from implementation plan)

```
[ ] docker compose up -d — postgres, keycloak, walt.id stack all healthy
[ ] Backend starts clean — operator wallet bootstrap logs "provisioned" or "skipped"
[ ] Second backend restart — no duplicate operator wallet account created
[ ] Vault: secret/operator/wallet populated with walletId + key ids
[ ] POST /api/companies — walletProvisioned: true in response
[ ] GET /company/:id/did.json — verificationMethod has 2 company-specific JWKs (Ed25519 + RSA)
[ ] POST /api/org-credentials/:id/verify — LP, LRN, T&C VCs appear in wallet UI
[ ] Wallet UI shows Membership VC (operator-issued) + 3 Gaia-X VCs
[ ] Two companies onboarded — each has distinct walletId and distinct public keys
[ ] platform_keypairs table does not exist (verify with psql \dt)
[ ] backend/.keys/ directory does not exist
```

---

## Infrastructure Fix Applied Today (2026-04-16)

- **Walt.id wallet SQLite not persisted** — added `waltid_wallet_data` Docker volume in `docker-compose.yml`. The SQLite DB at `/waltid-wallet-api/data/wallet.db` now survives container restarts.
- **Stale `operator_wallet` row** — deleted the row pointing to a wallet account that was wiped when the container was recreated during image update. Will be re-provisioned on next backend start.
- **Images pinned** — all three walt.id images pinned to v0.19.0 digests in `docker-compose.yml` and recorded in `docs/agreements/001-ssi-implementation-agreement.md §6.1`.
