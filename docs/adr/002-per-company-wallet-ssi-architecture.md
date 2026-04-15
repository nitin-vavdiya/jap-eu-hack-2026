# ADR-002: Per-Company Wallet & Self-Sovereign Identity Architecture

- **Status**: Proposed
- **Date**: 2026-04-15
- **Decision Makers**: Nitin Vavdiya
- **Related PRD**: `docs/brainstorms/per-company-wallet-ssi-requirements.md`

---

## Context

### Current State

The platform uses a single RSA-2048 keypair (`platform-signer`) stored in:
- `PlatformKeypair` DB table (`backend/prisma/schema.prisma:365-372`)
- Filesystem: `backend/.keys/gaiax-private.pem`, `backend/.keys/gaiax-public.pem`

All company VCs and VPs are signed by `VPSigner` (`backend/src/services/gaiax/vp-signer.ts`) using this shared key. Every company's DID document exposes the same platform public key. Walt.id is integrated (`backend/src/services/waltid.ts`) but used only for credential offer delivery — the actual signing happens in the backend.

### Problem

This is a fully custodial model with zero self-sovereignty:
- Platform can sign on behalf of any company at any time
- A single key compromise affects all participants
- Company DIDs don't bind to company-specific keys
- Keys stored in relational DB — a security antipattern

### Target

Move to a **per-company wallet model** using the single platform-hosted walt.id Community Stack:
- One wallet account per company within the shared walt.id deployment (not separate instances)
- Platform operator has its own separate wallet account (trust anchor role only)
- Backend delegates all signing to the appropriate company's wallet
- OID4VCI/OID4VP as the BYOW-ready abstraction layer (future: companies may bring their own wallet deployment)

---

## Decision

### 1. One Walt.id Account + Wallet Per Company (Within a Single Shared Deployment)

The platform runs a single walt.id Community Stack deployment (Wallet API :7001, Issuer API :7002, Verifier API :7003). Each company gets a dedicated account and wallet within this shared deployment — not a separate walt.id instance. The BYOW path (letting a company point to their own external wallet deployment) is a future capability, not in scope here.

During company onboarding, the backend creates a dedicated walt.id account for the company:

```
Account email:  company-{companyId}@wallet.internal
Wallet name:    {companyName} Wallet
Keys:
  - ed25519KeyId   → for all standard VCs/VPs (EdDSA, JWT algorithm: EdDSA)
  - rsaKeyId       → for Gaia-X GXDCH submissions (RS256, x5c header)
```

Account credentials (email + password) are stored in HashiCorp Vault at:
```
secret/company/{companyId}/wallet
  → accountEmail
  → accountPassword
  → walletId
  → ed25519KeyId
  → rsaKeyId
```

The backend fetches these from Vault when it needs to perform wallet operations on behalf of a company.

### 2. Platform Operator Wallet

A single walt.id account for the platform operator, bootstrapped at startup:

```
Account email:  operator@wallet.internal
Vault path:     secret/operator/wallet
Keys:
  - ed25519KeyId   → Membership VC issuance, operator's own VCs
  - rsaKeyId       → Operator's Gaia-X GXDCH compliance VC
```

The operator wallet signs:
- Membership VCs (issued to onboarded companies as proof of dataspace participation)
- Operator's own Gaia-X LegalParticipant VC

The operator wallet does **not** sign on behalf of participant companies after onboarding.

### 3. DID Document Key Binding

Company DID documents (`did:web:{domain}:company:{companyId}`) continue to be hosted by the backend but now reference the company's own public keys:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
  "id": "did:web:domain:company:123",
  "verificationMethod": [
    {
      "id": "did:web:domain:company:123#key-ed25519",
      "type": "JsonWebKey2020",
      "controller": "did:web:domain:company:123",
      "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
    },
    {
      "id": "did:web:domain:company:123#key-rsa",
      "type": "JsonWebKey2020",
      "controller": "did:web:domain:company:123",
      "publicKeyJwk": { "kty": "RSA", "n": "...", "e": "AQAB" }
    }
  ],
  "authentication": ["did:web:domain:company:123#key-ed25519"],
  "assertionMethod": ["did:web:domain:company:123#key-ed25519", "did:web:domain:company:123#key-rsa"]
}
```

Public keys (JWK) are fetched from the company's wallet during onboarding and **cached in the `Company` DB record** to avoid a wallet round-trip on every DID resolution.

> **Why not serve did.json from walt.id directly?** Verified: the walt.id Community Stack has no DID document hosting capability. `waltid/wallet-api/web.conf` configures only `webHost`/`webPort` — there is no `didHosting` or similar config section. The backend Express app (`backend/src/index.ts:90-126`) is the only did.json host and must remain so.

### 4. VC Issuance Flow

```
Backend                           Walt.id Issuer API         Company Wallet
  │                                       │                        │
  ├─ Fetch wallet auth from Vault ────────┼────────────────────────┤
  ├─ Build VC payload (unsigned)          │                        │
  ├─ Determine key: Ed25519 or RSA        │                        │
  ├─ POST /openid4vc/jwt/issue            │                        │
  │    issuerDid: company DID             │                        │
  │    issuerKey: { type:'jwk',           │                        │
  │      jwk: company's JWK }            │                        │
  │    credentialData: payload ──────────>│                        │
  │                                       │── signs with key ─────>│
  │<── credentialOfferUri ────────────────│                        │
  ├─ POST /exchange/useOfferRequest ──────────────────────────────>│
  │    (store signed VC in wallet)                                  │
  ├─ Record credential metadata in DB                               │
```

**Key selection rule:**
- Gaia-X compliance VCs (LegalParticipant, RegistrationNumber, TermsAndConditions) → RSA key (`kid: #key-rsa`)
- All other VCs (Membership, Ownership, InsuranceQuote) → Ed25519 key (`kid: #key-ed25519`)

### 5. VP Signing (Insurance Ownership Proof)

The VP flow is user-driven via the OID4VP protocol — the backend does not sign on behalf of the user:

```
Insurance Portal                Backend (Verifier)          User Wallet (portal-wallet)
       │                               │                              │
       ├── POST /underwriting/start ──>│                              │
       │                               ├── POST /openid4vc/verify ──>│ (Verifier API)
       │                               │<── presentationRequest ──────│
       │<── requestUri ────────────────│                              │
       │                               │                              │
       │                    (User opens portal-wallet)                │
       │                               │                              │
       │              User selects ownership VC & authorizes          │
       │                               │<── signed VP-JWT ────────────│
       │                               │    (signed by user's key)    │
       │<── verification result ────────│                              │
```

### 6. Wallet Service Abstraction (BYOW Interface)

```typescript
// backend/src/services/wallet/WalletService.ts

export interface WalletIssuanceService {
  /**
   * Issue a VC to a holder via OID4VCI.
   * Returns a credential offer URI that the holder's wallet claims.
   */
  issueCredential(params: {
    issuerDid: string;
    holderDid: string;
    credentialType: string;
    credentialData: Record<string, unknown>;
    keyType: 'ed25519' | 'rsa';
  }): Promise<string>; // credential offer URI

  /**
   * Initiate an OID4VP presentation request.
   * Returns a request URI to send to the holder's wallet.
   */
  requestPresentation(params: {
    verifierDid: string;
    credentialType: string;
    nonce: string;
  }): Promise<string>; // presentation request URI

  /**
   * Verify a VP-JWT submitted by a holder.
   */
  verifyPresentation(params: {
    vpToken: string;
    nonce: string;
    audience: string;
  }): Promise<VerificationResult>;
}

// Current implementation: WaltIdWalletService (uses walt.id APIs)
// Future implementation: ExternalWalletService (uses any OID4VC-compliant wallet)
```

---

## Target Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICE                          │
│                                                                  │
│  ┌──────────────────┐    ┌───────────────────────────────────┐   │
│  │ WalletProvisioning│    │      CompanyWalletService         │   │
│  │    Service        │    │  (per-company: issue, store, VP)  │   │
│  │                  │    │                                   │   │
│  │ onboarding step: │    │  ─ fetch wallet auth from Vault   │   │
│  │ create wallet,   │    │  ─ call walt.id issuer API        │   │
│  │ gen keys, Vault  │    │  ─ store VC in wallet             │   │
│  └──────────────────┘    │  ─ update DB credential index     │   │
│                          └───────────────────────────────────┘   │
│  ┌──────────────────┐    ┌───────────────────────────────────┐   │
│  │OperatorWallet    │    │       DIDResolverService          │   │
│  │   Service        │    │                                   │   │
│  │                  │    │  ─ did:web → DB + cached JWK      │   │
│  │ ─ bootstrap op.  │    │  ─ NO platform key in DID docs    │   │
│  │   wallet at boot │    │                                   │   │
│  │ ─ issue Membership│   └───────────────────────────────────┘   │
│  │   VCs            │                                            │
│  └──────────────────┘                                            │
└────────────────────────────────────────────────────────────────┬─┘
                                                                  │
                    ┌─────────────────────────────────────────────┼──────┐
                    │          WALT.ID COMMUNITY STACK            │      │
                    │                                             │      │
                    │  ┌─────────────┐  ┌──────────────┐  ┌──────┴────┐ │
                    │  │ Wallet API  │  │  Issuer API  │  │Verifier   │ │
                    │  │  :7001      │  │   :7002      │  │ API :7003 │ │
                    │  │             │  │              │  │           │ │
                    │  │ per-company │  │ OID4VCI sign │  │OID4VP     │ │
                    │  │ accounts &  │  │ with company │  │verify     │ │
                    │  │ wallets     │  │ key JWK      │  │           │ │
                    │  │ key storage │  │              │  │           │ │
                    │  └─────────────┘  └──────────────┘  └───────────┘ │
                    └────────────────────────────────────────────────────┘
                                          ▲
                                          │ credentials stored per company wallet
                    ┌─────────────────────┴──────────────────────────────┐
                    │              HASHICORP VAULT                        │
                    │                                                     │
                    │  secret/operator/wallet          (operator)         │
                    │  secret/company/{id}/wallet      (per company)      │
                    └─────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Add to `Company` table

```prisma
model Company {
  // ... existing fields ...

  // Walt.id wallet fields (added)
  walletAccountId   String?   // walt.id account ID
  walletId          String?   // walt.id wallet UUID
  ed25519KeyId      String?   // key ID in wallet for Ed25519 key
  rsaKeyId          String?   // key ID in wallet for RSA-2048 key
  ed25519PublicJwk  Json?     // cached public key JWK (Ed25519)
  rsaPublicJwk      Json?     // cached public key JWK (RSA-2048)
  walletProvisioned Boolean   @default(false)
}
```

### Remove `PlatformKeypair` table

```prisma
// DELETE THIS MODEL ENTIRELY:
// model PlatformKeypair { ... }
```

### Update `OrgCredential` table

```prisma
model OrgCredential {
  // ... existing fields ...
  vcJwt             String?   // REMOVE — JWT no longer stored in DB
  walletCredentialId String?  // ADD — reference to credential in walt.id wallet
}
```

### New: `OperatorWallet` singleton config

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

---

## New Backend Services

### `backend/src/services/wallet/WalletProvisioningService.ts`

Responsibilities:
- Create walt.id account for a company
- Create wallet under the account
- Generate Ed25519 and RSA-2048 keys in the wallet
- Export public JWKs and cache them in the Company record
- Store wallet credentials in Vault

### `backend/src/services/wallet/CompanyWalletService.ts`

Responsibilities:
- Fetch company wallet auth from Vault
- Authenticate to the company's walt.id wallet
- Sign and issue VCs on behalf of the company (via issuer API + company's JWK)
- Store issued VCs in the company's wallet
- Update DB credential index after issuance

### `backend/src/services/wallet/OperatorWalletService.ts`

Responsibilities:
- Bootstrap operator wallet at application startup
- Issue Membership VCs to onboarded companies
- Sign operator's own Gaia-X compliance VCs

### `backend/src/services/wallet/WaltIdWalletService.ts`

Implements `WalletIssuanceService` interface:
- `issueCredential()` — wraps OID4VCI issuance
- `requestPresentation()` — wraps OID4VP request
- `verifyPresentation()` — wraps OID4VP verification

---

## Updated Onboarding Flow (`POST /api/companies`)

```
Step 1:  Generate identifiers (companyId, BPN, tenantCode)        [unchanged]
Step 2:  Assign did:web DID                                        [unchanged]
Step 3:  Create Company record in DB                               [unchanged]
Step 4:  Create Keycloak admin user                                [unchanged]
Step 5:  Provision company wallet in walt.id                       [NEW]
           → Create account + wallet within shared walt.id deployment
           → Generate Ed25519 key + RSA-2048 key
           → Cache public JWKs in Company record
           → Store wallet credentials in Vault
           → UI: onboarding progress UI shows "Wallet Provisioning"
             as a distinct named step with status: pending/success/failed
Step 6:  Issue Gaia-X LegalParticipant VC                         [updated]
           → Sign with company's RSA key via wallet
           → Store in company's wallet
           → Record metadata in DB (no JWT)
Step 7:  Issue Membership VC (signed by operator wallet)           [NEW]
           → Operator wallet signs MembershipVC
           → Store in company's wallet
Step 8:  Submit to Gaia-X Compliance (optional)                    [updated]
           → VP signed with company's RSA key via wallet
Step 9:  Return onboarding result with wallet provisioning status  [updated]
```

---

## Files to Remove / Significantly Refactor

| File | Action |
|------|--------|
| `backend/src/services/gaiax/vp-signer.ts` | Remove `VPSigner` class. Replace with `CompanyWalletService` |
| `backend/src/services/waltid.ts` | Refactor — expand to full wallet management. Becomes `WaltIdWalletService` |
| `backend/prisma/schema.prisma` | Remove `PlatformKeypair`, add wallet fields to `Company`, update `OrgCredential` |
| `backend/.keys/` (directory) | Delete entirely |
| `backend/prisma/migrations/20260325145232_add_platform_keypair/` | Superseded — new migration drops this table |

---

## Migration Plan

Since the application is **not yet deployed**, a clean-slate migration is used:

1. Delete `backend/.keys/` directory
2. Create Prisma migration:
   - Drop `PlatformKeypair` table
   - Add wallet columns to `Company`
   - Add `walletCredentialId` to `OrgCredential`, remove `vcJwt`
   - Add `OperatorWallet` table
3. Run `npx prisma migrate reset --force` to apply clean schema
4. Update `backend/.env.example` to remove any key file paths, add Vault paths
5. On first application startup, the operator wallet is bootstrapped automatically

---

## Security Considerations

- **Private keys never leave walt.id wallets** — backend only handles public keys (JWK) and credential offer URIs
- **Vault AppRole** used for backend-to-Vault auth — token should have write access to `secret/company/*` and read access to `secret/operator/wallet`
- **Wallet account passwords** — use cryptographically random 32-byte passwords per company, stored only in Vault
- **Walt.id admin token** — if a platform-level admin API is used, treat this token as a high-value secret stored in Vault, not in environment variables
- **DID document serving** — public JWK served from DB cache; no wallet authentication required for DID resolution (public information)

---

## Open Questions

| ID | Question | Impact | Owner |
|----|----------|--------|-------|
| OQ-1 | Does walt.id issuer API support adding `x5c` header for GXDCH? | High — affects RSA key signing flow for Gaia-X | Research required |
| OQ-2 | Does Community Stack support multi-key wallets with `keyId`-scoped signing? | High — affects dual-key design | Verify with `POST /keys/generate` + `issuerKey.keyId` parameter |
| OQ-3 | Does the Vault AppRole token have write access to `secret/company/*`? | Medium — affects onboarding reliability | Confirm with Vault policy |
| OQ-4 | What is the Community Stack's account limit? | Low for MVP, high at scale | Check walt.id docs / test env |

### OQ-1 Fallback: GXDCH Signing Without x5c in Walt.id

If walt.id issuer API does not support `x5c` header injection, the recommended fallback is:

**Option A** — Hybrid signing for GXDCH only:
- Generate RSA keypair in walt.id
- Export RSA public key once → generate self-signed X.509 cert in backend → store cert in `OperatorWallet` or `Company`
- For GXDCH submissions: sign JWT in backend using a signing library, include `x5c` from stored cert, use private key via wallet signing endpoint (if supported) OR accept that GXDCH uses operator's cert for now
- Per-company Ed25519 handles all non-GXDCH VCs

**Option B** — Operator-custodial GXDCH signing:
- Platform operator signs GXDCH compliance VPs on behalf of participants
- Participants use their own Ed25519 key for all other VCs
- GXDCH submissions use operator's RSA key with x5c
- Less self-sovereign for Gaia-X specifically, but practical for POC/MVP

---

## Consequences

### Positive
- Companies have genuine cryptographic identity — their DID binds to their own key
- Platform key compromise does not compromise participants
- Platform operator cannot silently sign on behalf of participants after onboarding
- Keys are managed by a purpose-built wallet system, not a relational database
- OID4VCI/OID4VP abstraction enables future BYOW without re-issuing credentials

### Negative
- Onboarding becomes more complex (wallet provisioning adds latency and failure modes)
- Every VC signing requires a Vault lookup + walt.id API call (vs in-process signing today)
- Walt.id Community Stack multi-tenancy is email-account based, not true organization isolation — all company wallets share the same walt.id deployment
- x5c GXDCH requirement may need a workaround (see OQ-1)

### Neutral
- `VPSigner` is eliminated — signing logic moves to wallet service layer
- DB credential tables retain metadata but no longer store JWTs
