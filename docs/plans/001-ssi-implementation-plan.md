# Implementation Plan: SSI Per-Company Wallet Capability

**Status:** Draft  
**Date:** 2026-04-15  
**References:**
- **Implementation gate:** `docs/agreements/001-ssi-implementation-agreement.md` (non-negotiables, preconditions, first-milestone scope, **§6 runtime pinning** for walt.id images + Gaia-X URLs)
- PRD source: `docs/brainstorms/per-company-wallet-ssi-requirements.md`
- ADR: `docs/adr/002-per-company-wallet-ssi-architecture.md`

---

## Context

Current architecture uses a **single platform RSA-2048 keypair** (`PlatformKeypair` DB table + `.keys/` filesystem) to sign all company VCs and VPs. This is fully custodial — zero self-sovereignty. 

Target: move to **per-company wallet accounts** within a shared walt.id Community Stack. The backend acts as **orchestrator** only — **no private signing keys** in DB or filesystem; **private keys stay inside walt.id** (company + operator wallets). Vault stores **wallet auth secrets**, not exportable key material.

---

## Phase 1: Formalize Documents

### 1a. Create PRD (`docs/prd/001-ssi-per-company-wallet.md`)

Promote the brainstorm into a formal PRD with these sections:

| Section | Source |
|---------|--------|
| Overview / Problem Statement | Brainstorm "Problem Frame" |
| Goals (G1–G5) | Brainstorm verbatim |
| Non-Goals | Brainstorm verbatim |
| User Stories (US-1–US-7) | Brainstorm verbatim |
| Functional Requirements (R1–R22) | Brainstorm verbatim |
| **Success Metrics** | **NEW** (see below) |
| Open Questions (OQ-1–OQ-5) | Brainstorm verbatim |
| Out of Scope / Future | Brainstorm verbatim |

**New — Success Metrics to add:**
- All companies onboarded post-migration have `walletId` populated in DB
- DID documents serve company-owned public keys (not platform key)
- VC issuance completes with **no private signing keys** in backend DB, filesystem, or long-lived env — signing only via **walt.id** (company + operator wallets)
- `PlatformKeypair` table and `.keys/` directory no longer exist

### 1b. Finalize ADR (`docs/adr/002-per-company-wallet-ssi-architecture.md`)

ADR is comprehensive. Minor updates:
- Change `Status: Proposed` → `Status: Accepted` once team signs off
- **OQ-2** — keep **open until verified** on your running walt.id (multi-key + `keyId`-scoped issuance); do not mark resolved in ADR/plan until a manual test note exists
- Add "Implementation Status" section tracking phases below

---

## Phase 2: Prisma Schema Changes

**File:** `backend/prisma/schema.prisma`

### Add wallet fields to `Company` model:
```prisma
model Company {
  // ... existing fields ...

  // Walt.id wallet fields (NEW)
  walletAccountId   String?
  walletId          String?
  ed25519KeyId      String?
  rsaKeyId          String?
  ed25519PublicJwk  Json?
  rsaPublicJwk      Json?
  walletProvisioned Boolean @default(false)
}
```

### Remove `PlatformKeypair` model entirely

### Update `OrgCredential` model:
```prisma
model OrgCredential {
  // Remove:  vcJwt              String?
  // Add:     walletCredentialId String?
}
```

### Add new `OperatorWallet` singleton model:
```prisma
model OperatorWallet {
  id              String   @id @default(cuid())
  walletAccountId String
  walletId        String
  ed25519KeyId    String
  rsaKeyId        String
  provisionedAt   DateTime @default(now())
}
```

### Run migration:
```bash
cd backend
npx prisma migrate dev --name add_per_company_wallet
```

---

## Phase 3: New Wallet Services

All new files under `backend/src/services/wallet/`.

### 3a. `WalletIssuanceService.ts` — Interface (BYOW abstraction)

```typescript
export interface WalletIssuanceService {
  issueCredential(params: {
    issuerDid: string;
    holderDid: string;
    credentialType: string;
    credentialData: Record<string, unknown>;
    keyType: 'ed25519' | 'rsa';
  }): Promise<string>; // credential offer URI

  requestPresentation(params: {
    verifierDid: string;
    credentialType: string;
    nonce: string;
  }): Promise<string>; // presentation request URI

  verifyPresentation(params: {
    vpToken: string;
    nonce: string;
    audience: string;
  }): Promise<VerificationResult>;
}
```

### 3b. `WalletProvisioningService.ts`

`provisionCompanyWallet(companyId, companyName)` steps:
1. `POST /wallet-api/auth/create` — create walt.id account (`company-{companyId}@wallet.internal`)
2. `POST /wallet-api/wallet/create` — create wallet under the account
3. `POST /wallet-api/wallet/{walletId}/keys/generate` ×2 — Ed25519 + RSA-2048
4. `GET /wallet-api/wallet/{walletId}/keys/{keyId}` — export public JWKs for both keys
5. Write to Vault: `secret/company/{companyId}/wallet` (accountEmail, accountPassword, walletId, ed25519KeyId, rsaKeyId)
6. Update `Company` DB record: walletId, keyIds, publicJwks, `walletProvisioned = true`

`provisionOperatorWallet()` — same flow for `operator@wallet.internal`, Vault path `secret/operator/wallet`.

### 3c. `CompanyWalletService.ts`

`issueVC(companyId, holderDid, credentialType, payload, keyType)` steps:
1. Fetch wallet auth from Vault at `secret/company/{companyId}/wallet`
2. Authenticate to walt.id wallet API → get session token
3. `POST /openid4vc/jwt/issue` (Issuer API) with company JWK + payload
4. `POST /exchange/useOfferRequest` (Wallet API) — store signed VC in company's wallet
5. Update `OrgCredential` record with `walletCredentialId`

Key selection rule (aligned with ADR-002 OQ-1 resolution):
- Gaia-X **GXDCH-bound** credentials (LegalParticipant, RegistrationNumber, TermsAndConditions) → **`OperatorWalletService`** RSA + `x5c` (walt.id issuer cannot satisfy header requirements for participant RSA in MVP)
- Membership VC → `OperatorWalletService` Ed25519
- Company business VCs (Ownership, InsuranceQuote, etc.) → `CompanyWalletService` Ed25519 (`#key-ed25519`)

### 3d. `OperatorWalletService.ts`

- `bootstrapOnStartup()` — if `OperatorWallet` DB record missing, call `provisionOperatorWallet()`
- `issueMembershipVC(companyDid, companyId)` — signed by operator's Ed25519 key
- `issueGaiaXComplianceVC(...)` / GXDCH signing helpers — operator RSA + `x5c` chain (Option B path)
- Vault path: `secret/operator/wallet`

### 3e. `WaltIdWalletService.ts`

Implements `WalletIssuanceService` interface. Wraps walt.id Issuer API (:7002) and Verifier API (:7003). Supersedes current `backend/src/services/waltid.ts`.

---

## Phase 4: Update DID Resolver

**File:** `backend/src/services/did-resolver.ts`

Change `buildCompanyDidDocument(company)`:
- Read `company.ed25519PublicJwk` and `company.rsaPublicJwk` from DB (cached at provisioning time)
- Build two `verificationMethod` entries:
  - `did:web:domain:company:{id}#key-ed25519` → Ed25519 JWK
  - `did:web:domain:company:{id}#key-rsa` → RSA-2048 JWK
- Remove all references to platform public key / `getVPSigner()`

---

## Phase 5: Update Gaia-X Orchestrator

**File:** `backend/src/services/gaiax/orchestrator.ts`

Critical change around line 128:
```typescript
// BEFORE:
const signer = getVPSigner();
const signedVC = await signer.signVCAs(vcPayload, identity);

// AFTER (sketch — branch by credential class):
const companyWallet = new CompanyWalletService();
const operatorWallet = new OperatorWalletService();
const credentialOfferUri = isGaiaXGxdchCredential(credentialType)
  ? await operatorWallet.issueGaiaXComplianceVC(/* ... */)
  : await companyWallet.issueVC(org.id, holderDid, credentialType, payload, 'ed25519');
```

Remove all imports of `vp-signer`.

---

## Phase 6: Update Company Onboarding Route

**File:** `backend/src/routes/companies.ts`

Insert two new steps in `POST /api/companies`:

```
Step 1:  Generate identifiers (companyId, BPN, tenantCode)   [unchanged]
Step 2:  Assign did:web DID                                   [unchanged]
Step 3:  Create Company record in DB                          [unchanged]
Step 4:  Create Keycloak admin user                           [unchanged]
Step 5:  Provision company wallet in walt.id                  [NEW]
           → WalletProvisioningService.provisionCompanyWallet()
           → On failure: return { walletProvisioningStatus: 'failed' }
Step 6:  Issue Gaia-X LegalParticipant VC                    [updated — operator RSA + `x5c` (OQ-1 / Option B)]
Step 7:  Issue Membership VC from operator wallet             [NEW]
           → OperatorWalletService.issueMembershipVC()
Step 8:  Submit to Gaia-X Compliance (optional)              [updated — operator RSA + `x5c` for GXDCH-facing VP/JWT]
Step 9:  Return result with walletProvisioningStatus field    [updated]
```

Response must include `walletProvisioningStatus: 'success' | 'failed'` so `portal-dataspace` CompanyRegistration UI can display wallet provisioning as a named step with real-time status (per R2).

---

## Phase 7: Cleanup

| Action | Target |
|--------|--------|
| Delete file | `backend/src/services/gaiax/vp-signer.ts` |
| Delete directory | `backend/.keys/` |
| Move then delete | `backend/src/services/waltid.ts` → logic lives under `services/wallet/` (`WaltIdWalletService` etc.); delete file after imports migrated |
| Remove all `getVPSigner()` call sites | `grep -r "vp-signer" backend/src/` |
| Update env vars | `backend/.env.example` — remove key file paths, add Vault wallet paths |
| Update Helm chart | `edc/tx-edc-eleven/values.yaml` — remove key file mounts |

New env vars to add to `.env.example`:
```bash
# Vault paths (wallet credentials stored here — not in .env)
VAULT_OPERATOR_WALLET_PATH=secret/operator/wallet
VAULT_COMPANY_WALLET_PATH_PREFIX=secret/company
```

---

## Phase 8: Operator Wallet Bootstrap at Startup

**Goal:** On every app start, ensure the **platform operator** has a walt.id account + wallet + keys, Vault secrets at `secret/operator/wallet`, and a singleton **`OperatorWallet`** row — **without** duplicating wallets on restart and **without** storing private keys in Postgres.

**Primary file:** `backend/src/index.ts` (invoke bootstrap **after** Prisma/DB connect, **before** listening for HTTP traffic — or immediately after listen if you prefer non-blocking bootstrap; prefer **blocking** for MVP so first request does not race an incomplete operator wallet).

```typescript
import { OperatorWalletService } from './services/wallet/OperatorWalletService';

// Bootstrap operator wallet (idempotent — see §8.2)
await new OperatorWalletService().bootstrapOnStartup();
```

### 8.1 Migration vs runtime (do not mix)

| Concern | Where it happens | What it does |
|---------|------------------|----------------|
| **Schema** | **Prisma migration** (Phase 2) | Adds `OperatorWallet` table (and company wallet columns, etc.). **No** HTTP calls to walt.id, **no** Vault writes. |
| **Provisioning** | **`OperatorWalletService.bootstrapOnStartup()`** at runtime | Calls walt.id Wallet API, writes Vault, upserts `OperatorWallet` row. **Idempotent.** |

Migrations must stay deterministic and offline-capable; all “does wallet exist in walt.id?” logic lives in **startup**, not in SQL.

### 8.2 Bootstrap algorithm (recommended)

Implement `bootstrapOnStartup()` roughly as follows (order matters for crash recovery):

1. **Read** singleton `OperatorWallet` from DB (e.g. `findFirst` or fixed id).
2. **If row exists and `walletId` + key ids are populated** → optional **verify** path: authenticate to walt.id with secrets from Vault, confirm wallet + keys still exist (lightweight GET or equivalent). On success → **return** (already provisioned).
3. **If row missing or incomplete** (or verify failed with “not found”):
   - **Read Vault** `secret/operator/wallet` (path from env, e.g. `VAULT_OPERATOR_WALLET_PATH`).
   - **If Vault has valid credentials** (account + password + wallet id + key ids) but DB was wiped → **reconcile**: upsert `OperatorWallet` from Vault payload, then verify in walt.id; **return** if consistent.
   - **If Vault empty or unusable** → **provision** via `WalletProvisioningService.provisionOperatorWallet()`:
     - Create walt.id account `operator@wallet.internal` (or **lookup-first** if API supports “get by email” to avoid duplicates on partial failures).
     - Create wallet, generate Ed25519 + RSA keys, export **public** JWKs if needed for operator DID later.
     - **Write Vault** atomically (single KV write or versioned secret) with: `accountEmail`, `accountPassword`, `walletId`, `walletAccountId`, `ed25519KeyId`, `rsaKeyId` (names per ADR).
     - **Upsert** `OperatorWallet` row with the same ids.
4. **If provision fails** mid-way (walt.id up but Vault write fails, etc.):
   - **Do not** leave a half-written DB row without Vault (or vice versa). Use a short transaction or “write Vault first, then DB” with a clear **manual recovery** doc if walt.id created account but DB never saved (see §8.4).
5. **Log** structured outcome: `operator_wallet_bootstrap` = `skipped` | `reconciled` | `provisioned` | `failed` with reason.

**Idempotency rule:** repeated starts must **not** create multiple operator accounts. Prefer walt.id **lookup-by-email** before `auth/create`, or store a `waltidAccountId` in DB/Vault after first success and branch on that.

### 8.3 Sources of truth (avoid split-brain)

| Artifact | Source of truth | DB role |
|----------|-------------------|---------|
| Private keys | **walt.id wallet only** | Never stored |
| Wallet passwords / API auth | **Vault** | Never in env except dev-only |
| `walletId`, key ids, account ids | **Vault + DB mirror** | `OperatorWallet` row for fast lookup at runtime; **reconcile** from Vault if DB empty |

If DB and Vault disagree after restore, define policy: **Vault wins** for secrets; **walt.id** wins for whether keys exist; DB is rebuilt from the other two.

### 8.4 Failure modes (MVP behavior)

| Scenario | Suggested behavior |
|----------|-------------------|
| walt.id unreachable on start | **Fail startup** (exit non-zero) **or** log `fatal` and refuse Gaia-X / Membership paths until a health admin endpoint reports ready — pick one product-wide; MVP often **fail fast** so misconfigured compose is obvious. |
| Vault unreachable / permission denied | **Fail startup** — cannot guarantee N1 without secrets store. |
| DB row exists, Vault missing | **Fail startup** with actionable message — manual restore from backup or re-provision with ops approval (re-provisioning may create a **new** walt.id account if old one orphaned). |
| Vault exists, walt.id account deleted externally | **Fail verify**; log error; optional **admin-only** “force reprovision” flag later — not required for first PR. |
| Partial provision (walt.id account created, Vault write failed) | **Alert + fail**; document manual cleanup of orphan walt.id account in runbook. |

### 8.5 Verification (extend checklist)

After implementation, confirm:

- [ ] Cold start: empty DB `OperatorWallet` + empty Vault path → bootstrap **creates** walt.id + Vault + row.
- [ ] Second start: **no** new walt.id account (same `walletId` in DB and walt.id).
- [ ] `vault kv get` on operator path shows secrets; **no** private PEM in repo or DB.
- [ ] Operator bootstrap completes **before** first `POST /api/companies` that issues Membership VC (or queue onboarding until operator ready).

---

## Open Questions

| ID | Question | Status | Blocks |
|----|----------|--------|--------|
| OQ-1 | Does walt.id issuer API support `x5c` header for RSA/GXDCH submissions? | **RESOLVED — NO** (see below) | Phase 3c, R8 |
| OQ-2 | Does Community Stack support per-wallet `keyId`-scoped signing? | Open — test manually | Phase 3b, 3c |
| OQ-3 | Does Vault AppRole token have write access to `secret/company/*`? | Open — check Vault policy | Phase 3b |

### OQ-1 Resolution (researched 2026-04-15)

**walt.id Community Stack does NOT support x5c header injection for W3C VC JWT format.**

- The issuer API `issuerKey` accepts only `{ type: 'jwk' }` or KMS reference — no x509/x5c input
- Custom JOSE header fields (`x5c`, `iss`, `cty`) cannot be injected via the API request body
- x509 support exists only for SD-JWT VC format (not W3C VC JWT used by GXDCH)
- GitHub issue [walt-id/waltid-identity#778](https://github.com/walt-id/waltid-identity/issues/778) (opened Sep 2024, marked **Stale**) confirms GXDCH header mismatch — unresolved, no owner

**Decision: Use ADR Fallback Option B — Operator **wallet** for GXDCH subset (SSI + no key export)**

- Gaia-X compliance JWTs/VPs that require `x5c` → signed using **operator RSA inside the operator walt.id wallet** (backend **orchestrates** walt.id APIs — **no** Node `crypto.sign` with extracted private keys)
- All other VCs (Membership, Ownership, InsuranceQuote) → **Ed25519** via walt.id (operator wallet for Membership; company wallet for company-issued types) ✓
- **Risk:** if walt.id cannot perform operator RSA + `x5c` entirely inside the stack, **this decision is not implementable** without violating key non-export — spike API proof **before** Phase 3 closes
- R8 (per-company RSA as GXDCH **signing** key) deferred until walt.id supports it without export
- BYOW interface (R21/R22) still built for company OID4VCI paths; GXDCH may remain a narrow operator-wallet module

**Action before Phase 3:** Manually test OQ-2 (keyId-scoped signing) against local walt.id.

---

## Critical Files Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `docs/prd/001-ssi-per-company-wallet.md` | 1a | CREATE |
| `docs/adr/002-per-company-wallet-ssi-architecture.md` | 1b | UPDATE (status → Accepted) |
| `backend/prisma/schema.prisma` | 2 | UPDATE |
| `backend/src/services/wallet/wallet-issuance-service.ts` | 3a | CREATE (interface only — first slice) |
| `backend/src/services/wallet/operator-wallet-service.ts` | 8 | CREATE (bootstrap stub — first slice) |
| `backend/src/services/wallet/WalletProvisioningService.ts` | 3b | CREATE |
| `backend/src/services/wallet/CompanyWalletService.ts` | 3c | CREATE |
| `backend/src/services/wallet/OperatorWalletService.ts` | 3d | CREATE |
| `backend/src/services/wallet/WaltIdWalletService.ts` | 3e | CREATE |
| `backend/src/services/did-resolver.ts` | 4 | UPDATE |
| `backend/src/services/gaiax/orchestrator.ts` | 5 | UPDATE |
| `backend/src/routes/companies.ts` | 6 | UPDATE |
| `backend/src/index.ts` | 8 | UPDATE |
| `backend/src/services/gaiax/vp-signer.ts` | 7 | DELETE |
| `backend/src/services/waltid.ts` | 7 | MOVE to `services/wallet/` then DELETE empty re-export |
| `backend/.keys/` | 7 | DELETE |
| `backend/.env.example` | 7 | UPDATE |

---

## Verification Checklist

```
[ ] docker compose up -d — postgres, keycloak, walt.id stack running
[ ] npm run dev:backend — starts without error
[ ] Operator bootstrap (Phase 8): second start does not create duplicate operator walt.id account
[ ] Vault: secret/operator/wallet populated; DB: OperatorWallet row matches walletId / key ids
[ ] POST /api/companies — response includes walletProvisioningStatus: 'success'
[ ] GET /company/{id}/did.json — verificationMethod has company-specific JWKs
[ ] Check Vault: vault kv get secret/company/{id}/wallet — credentials exist
[ ] Check DB: Company.walletProvisioned = true, ed25519PublicJwk populated
[ ] Confirm PlatformKeypair table does not exist
[ ] Confirm backend/.keys/ directory does not exist
[ ] npm test — all existing tests pass
[ ] Onboard 2 companies — each has distinct walletId and distinct public keys in DID doc
```
