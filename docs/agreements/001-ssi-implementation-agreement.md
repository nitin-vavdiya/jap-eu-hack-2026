# Agreement: SSI Per-Company Wallet — Start Implementation

**Status:** Active (pre-code)  
**Date:** 2026-04-15  
**Reads with:** `docs/adr/002-per-company-wallet-ssi-architecture.md`, `docs/plans/001-ssi-implementation-plan.md`, PRD source `docs/brainstorms/per-company-wallet-ssi-requirements.md`

This document is the **explicit gate** to begin implementation. If any **blocker** below is not satisfied, we pause or narrow scope instead of bypassing the agreement.

---

## 1. Non-negotiables (all parties align)

| # | Rule |
|---|------|
| N1 | **Private signing keys do not leave walt.id** — no product signing via exported PEM/private JWK in the Node app, no revival of filesystem `.keys/` for signing, no private key columns in Postgres. Vault holds **wallet authentication secrets** only, unless a later ADR explicitly adopts KMS-backed issuer keys with the same non-export property. |
| N2 | **SSI intent** — Per-company `did.json` uses **company public keys** (cached from wallet provisioning), not a shared platform key. Day-to-day company credentials use the **company wallet** (Ed25519 path). |
| N3 | **Operator trust boundary is explicit** — Membership VC and any **GXDCH-facing** artifacts use the **operator wallet** only where ADR-002 / PRD say so; document verifier-facing behavior when operator is issuer vs company. |
| N4 | **No silent Gaia-X workaround** — If walt.id cannot produce Gaia-X–acceptable JWTs **without** breaking N1, we **defer or scope-cut** Gaia-X submission for that milestone rather than signing in the backend. |

---

## 2. Preconditions (must be true before merge-ready “SSI wallet” milestone)

| ID | Precondition | Owner | Done when |
|----|--------------|-------|-----------|
| P1 | **OQ-2 spike:** Multi-key wallet + `keyId` (or equivalent) verified on **your** walt.id Community Stack image (create two keys, issue with intended key). | Eng | **§6** filled with image repo digests (or explicit tags) + §6.3 spike row / ADR “Implementation notes” |
| P2 | **GXDCH spike (choose one path):** (A) Prove Issuer + operator wallet can produce tokens **accepted** by the Gaia-X compliance step you use, **or** (B) Document **deferred** Gaia-X submit for this milestone with product sign-off. | Eng + Product | **§6.2–6.3** lists `GAIAX_*` URLs used for the test; written outcome; no fake “done” |
| P3 | **Vault:** AppRole (or chosen auth) can **write** `secret/company/*/wallet` and operator path per plan. | Ops/Eng | Policy snippet or ticket link |
| P4 | **Wallet external signatures** — If Community Stack has `external-signature-endpoints`, decision recorded: **disabled** for MVP unless there is a reviewed exception. | Eng | Config note in deploy docs or `values.yaml` comment |

---

## 3. Scope for first implementation milestone (suggested)

**In scope**

- Prisma: `Company` wallet fields, `OperatorWallet`, remove `PlatformKeypair`, `OrgCredential` without `vcJwt` (per plan).
- `WalletProvisioningService` + Vault paths for company + operator.
- `CompanyWalletService` for **Ed25519**-based issuance flows you already need (non-GXDCH).
- `OperatorWalletService` for **Membership** (operator Ed25519) once P1 is green.
- DID resolver: company cached JWKs only.
- Onboarding: wallet step + `walletProvisioningStatus`; ordering per ADR once Gaia-X path is decided per P2.
- Remove `VPSigner` / platform key usage for paths replaced above.

**Explicitly out of scope until second milestone (unless P2 is green earlier)**

- Production Gaia-X GXDCH submit using a path that violates N1 or N4.
- BYOW provider swap beyond interface + single walt.id implementation.
- Key rotation, formal `docs/prd/001-*` promotion (can follow Phase 1a of plan separately).

---

## 4. Engineering agreements

| Topic | Agreement |
|-------|-----------|
| Issuer vs Wallet | **Wallet API** for accounts/keys/storage/present; **Issuer API** for OID4VCI issuance orchestration. Do not conflate the two in code comments or env naming. |
| `waltid.ts` | **Move** logic into `backend/src/services/wallet/` then remove the monolith; no duplicate signing paths. |
| ADR status | Keep ADR **Proposed** until P1–P2 outcomes are written down; then move to **Accepted** in the same PR as the spike notes (plan Phase 1b). |
| Tests | No merge without: **happy path** company onboard with wallet provisioned (or mocked walt.id with contract tests if agreed), and **DID** snapshot test for company JWKs. |

---

## 5. Conflict resolution

If implementation discovery contradicts ADR/PRD:

1. Stop and open a **small ADR amendment** or PRD delta (one section).
2. Do **not** ship backend-held keys to “unblock” without changing this agreement and ADR.

---

## 6. Runtime pinning (walt.id + Gaia-X) — **fill on first spike / CI hardening**

Values below mirror the repo **as of documentation update** (`docker-compose.yml`, `backend/src/services/gaiax/config.ts`, `backend/src/services/gaiax/vp-signer.ts`, `backend/src/services/gaiax/live-client.ts`). **Update §6.1–6.3** when you pin images or change lab URLs for a milestone.

### 6.1 walt.id Community Stack (Docker Compose)

| Service (compose key) | Image line in `docker-compose.yml` | Notes |
|----------------------|-------------------------------------|--------|
| `waltid-wallet-api` | `waltid/wallet-api:latest` | **Floating tag** — not reproducible until pinned |
| `waltid-issuer-api` | `waltid/issuer-api:latest` | Same |
| `waltid-verifier-api` | `waltid/verifier-api:latest` | Same |

**After `docker compose pull`**, capture digests once and paste into the table (or commit `image: name@sha256:…` in compose):

```bash
docker image inspect waltid/wallet-api:latest --format '{{index .RepoDigests 0}}'
docker image inspect waltid/issuer-api:latest --format '{{index .RepoDigests 0}}'
docker image inspect waltid/verifier-api:latest --format '{{index .RepoDigests 0}}'
```

| Image | RepoDigest | Captured date |
|-------|------------|---------------|
| `waltid/wallet-api` | `waltid/wallet-api@sha256:17963c8421f27d36aa23572761a74886a901e7aa0b6864998b07458e6ca15a7d` | 2026-04-16 |
| `waltid/issuer-api` | `waltid/issuer-api@sha256:3b1bf788e474db5d62a4744f9b5c8ad771d6dd0abe21d75aa1f1e4a702bb1e65` | 2026-04-16 |
| `waltid/verifier-api` | `waltid/verifier-api@sha256:143674012c543189b80c22d764d6324f17ab11f925ac2a4503839171e5635994` | 2026-04-16 |

These digests correspond to **v0.19.0** (released 2026-04-08). Pinned in `docker-compose.yml` on 2026-04-16.

### 6.2 Gaia-X / GXDCH endpoints (backend defaults)

**Endpoint sets** (`backend/src/services/gaiax/config.ts`), tried in **priority** order until one passes health selection:

| Priority | Name | `compliance` base URL | `registry` | `notary` |
|----------|------|------------------------|-------------|----------|
| 0 | Gaia-X Lab (Loire development) | `GAIAX_LAB_COMPLIANCE_URL` **or** `https://compliance.lab.gaia-x.eu/development` | `GAIAX_LAB_REGISTRY_URL` **or** `https://registry.lab.gaia-x.eu/v2` | `GAIAX_LAB_NOTARY_URL` **or** `https://registrationnumber.notary.lab.gaia-x.eu/v2` |
| 1 | CISPE CloudDataEngine | `https://compliance.cispe.gxdch.clouddataengine.io/v2` | `https://registry.cispe.gxdch.clouddataengine.io/v2` | `https://notary.cispe.gxdch.clouddataengine.io/v2` |
| 2 | Pfalzkom GXDCH | `https://compliance.pfalzkom-gxdch.de/v2` | `https://portal.pfalzkom-gxdch.de/v2` | `https://trust-anker.pfalzkom-gxdch.de/v2` |

**Compliance submission path** (appended to chosen compliance base URL):

- `POST {compliance}/api/credential-offers/standard-compliance` — see `backend/src/services/gaiax/live-client.ts`.

**VP-JWT default `aud`** (if not overridden when signing):

- `https://compliance.lab.gaia-x.eu/development` — see `backend/src/services/gaiax/vp-signer.ts`.

**Related env vars** (documented in `backend/.env.example`):

- `GAIAX_MOCK_MODE`, `GAIAX_TIMEOUT`, `GAIAX_RETRY_ATTEMPTS`, `GAIAX_RETRY_DELAY`
- `GAIAX_LAB_COMPLIANCE_URL`, `GAIAX_LAB_REGISTRY_URL`, `GAIAX_LAB_NOTARY_URL`
- `GAIAX_DID_DOMAIN`, `GAIAX_DID_PATH` (DID web host + path for `did.json` resolution by compliance)
- `APP_BASE_URL` (required for stable public DID resolution — see `validateEnv.ts` comments)

### 6.4 N1 deviation — RSA key export for Gaia-X VC wallet storage (recorded 2026-04-16)

**Non-negotiable affected:** N1 ("private signing keys do not leave walt.id")

**What happens today:** `storeVcInCompanyWalletViaOID4VCI` (in `backend/src/services/wallet/company-wallet-service.ts`) exports the company's RSA private JWK from the wallet via `exportWalletPrivateJwk`, passes it transiently to the Issuer API for OID4VCI signing, then discards it. The key is never written to Postgres, Vault, or disk — it exists in-process for a single signing round-trip only.

**Why N1 cannot be satisfied today:** The Community Stack wallet API (confirmed through v0.19.0) has no `credentials/import` endpoint and no in-wallet VC signing API. The only credential write path is `exchange/useOfferRequest` (OID4VCI), which requires the issuer to hold the signing key. Enterprise tier would add the import endpoint; a signing-proxy sidecar could satisfy the spirit of N1 without an upgrade. Both were evaluated and deferred.

**Decision (2026-04-16):** Accept the transient key-export path for this milestone. The key is exported only within the Gaia-X compliance flow, never persisted outside the wallet. Revisit when either (a) Community Stack gains `credentials/import`, or (b) a signing-proxy sidecar is scoped.

**Scope of violation:** Gaia-X LP/LRN/T&C VC signing only. Membership VC (operator wallet, Ed25519) is unaffected — keys never leave the wallet for that flow.

---

### 6.3 Spike record (optional log)

_Use for P1/P2 outcomes (date, engineer, pass/fail, notes)._

| Date | Spike | Result | Notes / links |
|------|-------|--------|----------------|
| | OQ-2 multi-key / `keyId` | | |
| | GXDCH vs Lab compliance | | |

---

## 7. Sign-off (optional but recommended)

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering | | | P1–P4 addressed or waived |
| Product / owner | | | Scope + GXDCH defer acceptable |

---

*Starting implementation means the first PR may assume this file is approved unless individual items are explicitly waived in writing in the PR description.*
