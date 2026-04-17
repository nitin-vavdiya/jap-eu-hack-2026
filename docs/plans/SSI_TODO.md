# SSI Implementation — Remaining TODO

**Last updated:** 2026-04-17  
**Context:** Per-company wallet SSI architecture is largely implemented. This file tracks what remains before the first milestone is complete.

---

## Completed 2026-04-17

- **`/wallet/credentials` fixed** — now requires `?companyId=<uuid>`, loads company wallet context via `getCompanyWalletContext(companyId)`, returns that company's credentials (not operator's). `/:id/issued-vcs` follows the same pattern using `orgCredential.companyId`. (`backend/src/routes/org-credentials.ts`)
- **`waltid.ts` monolith removed** — generic helpers moved to `backend/src/services/wallet/walt-generic-client.ts` (`issueCredentialSimple`, `verifyPresentationOID4VP`). `listWalletCredentials` now imported from `wallet-api-client.ts` with proper `(session, walletId)` signature. All import sites updated. `backend/src/services/waltid.ts` deleted.
- **`backend/.keys/gaiax-{private,public}.pem` deleted** — old platform keypair files. `holder-mario-sanchez-*.pem` retained (still used by `vp-processor.ts` for portal DPP / `did:smartsense:` flow — separate subsystem from Gaia-X per-company wallet).
- **ADR-002 marked `Accepted`** with acceptance date 2026-04-17.

---

## Open — to verify on next backend run

### 1. Operator bootstrap idempotency (code-verified, runtime not yet re-confirmed)
`OperatorWalletService.bootstrapOnStartup()` early-returns when `prisma.operatorWallet.findFirst()` returns a row, so idempotency is structurally correct. Runtime check still outstanding after the 2026-04-16 container restart + stale-row cleanup:

```bash
# Start backend — watch for exactly one of:
#   "Operator walt.id wallet provisioned and recorded"  (first run)
#   "Operator wallet already recorded — skipping bootstrap"  (subsequent runs)

# Confirm Vault was written:
curl -s -H "X-Vault-Token: dev-root-token" \
  http://localhost:8200/v1/secret/data/operator/wallet | jq .data.data
```

---

### 2. ADR ↔ implementation deviation to document
ADR-002 §Non-negotiables #2 says "private keys never leave walt.id … no in-process crypto.sign". The current per-company VC/VP signing path (`company-wallet-service.ts` → `getCompanyPrivatePem` → `jwt.sign`) **does** export the RSA private JWK transiently and signs locally. Reason: Gaia-X ICAM requires `iss` in the JOSE header and walt.id `/keys/{id}/sign` does not give header control.

**Action:** either (a) soften the non-negotiable to "no long-lived private keys on disk/DB; transient in-memory export is allowed for Gaia-X ICAM-mandated header fields that walt.id signing cannot produce", or (b) implement the walt.id signing path once walt.id adds full JWS header control. Currently the ADR is marked Accepted with this gap unresolved.

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
