---
date: 2026-04-15
topic: per-company-wallet-self-sovereign-identity
---

# Per-Company Wallet & Self-Sovereign Identity (SSI)

## Problem Frame

The current architecture uses a **single platform keypair** (RSA-2048) stored in the backend database and filesystem. Every company's Verifiable Credentials (VCs) and Verifiable Presentations (VPs) are signed with this shared platform key. All company DID documents point to the same platform public key. This is a purely custodial model with several problems:

1. **No self-sovereignty** — Companies do not control their own cryptographic identity. The platform operator can sign anything on behalf of any company without their knowledge or consent.
2. **Single point of failure** — Compromise of the platform key compromises every company's verifiable identity simultaneously.
3. **Scalability risk** — One key for all companies means key rotation affects every participant at once.
4. **Weak DID binding** — `did:web:domain:company:123` resolves to a document with the *platform* public key, not the company's own key. This defeats the purpose of per-company DIDs.
5. **No future BYOW path** — The current design makes it impossible to allow companies to bring their own wallet without a full architectural rewrite.
6. **Database key storage** — Storing private keys in a relational database (and on the filesystem) is a security antipattern. Keys belong in a dedicated secrets store or HSM-backed wallet.

---

## Goals

**G1 — Per-Company Cryptographic Identity**
Each dataspace participant has its own keypair and a dedicated wallet account within the single platform-hosted walt.id deployment. The platform cannot sign **ordinary business** credentials on behalf of a company without access to that company's wallet credentials. **Exception:** Gaia-X **GXDCH-bound** JWTs use the operator wallet RSA path (ADR-002 OQ-1 resolution — walt.id issuer cannot emit required JOSE headers for participant RSA keys). (Future: companies may bring their own wallet deployment — see G4.)

**G2 — Walt.id as the Wallet Infrastructure**
All **cryptographic** operations (key generation inside wallets, VC issuance signing, VC storage, wallet-side signing used for trust-anchor flows) are delegated to the walt.id Community Stack. The backend coordinates API calls and stores **public** material and **wallet auth secrets** in Vault — **not** exportable private signing keys.

**G3 — Platform Operator Wallet**
The platform operator (operating company) has its own dedicated wallet for trust-anchor responsibilities: issuing Membership VCs to participants, holding the operator's own Gaia-X credentials, and signing **GXDCH-facing** RSA JWTs where `x5c` / header requirements are not achievable through the participant company wallet via walt.id (ADR-002 OQ-1 resolution).

**G4 — BYOW-Ready Abstraction**
The backend's wallet integration is abstracted behind an OID4VCI/OID4VP interface. A future "Bring Your Own Wallet" feature only requires swapping the implementation, not re-issuing credentials.

**G5 — No Keys in the Database**
The `PlatformKeypair` database table and `.keys/` filesystem directory are eliminated. Keys live in walt.id wallets and (for credentials) in HashiCorp Vault.

---

## Non-Goals

- Replacing Keycloak for identity/auth (out of scope — Keycloak handles authentication, walt.id handles verifiable credentials)
- **End-user (Car Buyer) wallet and SSI** — this PRD covers dataspace participant (company) SSI only; end-user wallet experience is a separate concern handled by portal-wallet
- **Insurance Agent VP verification flows** — out of scope for this feature; covered by the existing OID4VP verification design
- User-level wallet management (portal-wallet handles end-user wallets separately; this PRD covers company wallets)
- Multi-region key replication or HSM integration (future concern)
- Zero-downtime migration (app is not deployed — fresh start is acceptable)

---

## User Stories

### Platform Operator

**US-1** — As the platform operator, when I onboard a new company, a dedicated walt.id wallet is automatically created for that company so they have their own cryptographic identity from day one.

**US-2** — As the platform operator, I can issue a Membership VC to an onboarded company, signed by the operator's own key (not the company's key), proving that the company is a legitimate dataspace participant.

**US-3** — As the platform operator, I can see which companies have active wallets and the status of their wallet provisioning.

**US-4** — As the platform operator, the company's wallet credentials (used to authenticate the backend to the company's wallet) are stored securely in HashiCorp Vault — not in the application database.

### Company Admin

**US-5** — As a company admin, when I complete onboarding, Gaia-X LegalParticipant (and related dataspace compliance artifacts needed for participation) are completed end-to-end. **GXDCH-bound signing** uses the **platform operator's RSA key** with `x5c` (per ADR-002 OQ-1 resolution). Company-scoped credentials that remain self-signed via the company wallet use the company's **Ed25519** key (for example Ownership flows).

**US-6** — As a company admin, my company's DID document (`did:web:domain:company:{id}`) contains *my company's* public key — not the platform key.

**US-7** — As a company admin, when my company's credentials need to be re-issued (e.g., after key rotation), only my company's credentials are affected.

---

## Functional Requirements

### Wallet Provisioning (during company onboarding)

- **R1.** When a company is onboarded via `POST /api/companies`, the backend must automatically:
  a. Create a walt.id account for the company (email: `company-{companyId}@wallet.internal`)
  b. Create a wallet under that account
  c. Generate an Ed25519 key in the wallet (used for all standard VCs/VPs)
  d. Generate an RSA-2048 key in the wallet (published in `did.json` for Gaia-X interoperability; **GXDCH submission signing uses operator RSA**, not walt.id issuer with company RSA — ADR-002 OQ-1 resolution)
  e. Store the wallet credentials in HashiCorp Vault at `secret/company/{companyId}/wallet`
  f. Store the `walletId`, `walletAccountId`, `ed25519KeyId`, and `rsaKeyId` in the Company DB record

- **R2.** Wallet provisioning failure must not silently succeed. If any step (account creation, key generation, Vault storage) fails, the onboarding response must include a clear error status. The operating company admin portal must display wallet provisioning as a distinct, named step in the onboarding flow UI — with a real-time status indicator (pending / success / failed) so the operator can see exactly where a failure occurred.

- **R3.** The platform operator must have a dedicated walt.id wallet provisioned at startup (if not already present), with credentials stored in Vault at `secret/operator/wallet`.

### DID Document

- **R4.** The `GET /company/:companyId/did.json` endpoint must serve a DID document that includes the company's own public keys (Ed25519 and RSA-2048) fetched from the company's walt.id wallet.

- **R5.** The DID document must include two verification methods:
  - `#key-ed25519` → Ed25519 public key (JWK format)
  - `#key-rsa` → RSA-2048 public key (JWK format, for Gaia-X)

- **R6.** Generating a DID document must not require a round-trip to walt.id on every request. The company's public keys (JWK) must be cached in the `Company` DB record after wallet provisioning and refreshed only on key rotation. **Note:** Serving did.json directly from walt.id is not possible — the walt.id Community Stack has no DID hosting capability (verified: `waltid/wallet-api/web.conf` configures only `webHost`/`webPort`; there is no DID hosting config). The backend Express app must continue to serve all `did.json` endpoints.

### VC Issuance & Signing

- **R7.** Verifiable Credentials must be signed using keys scoped to the correct trust role: **participant-issued** credentials use the issuing **company's** walt.id wallet keys (Ed25519-first). **Operator-issued** credentials use the **operator** wallet. The legacy **platform shared keypair** must not be used after migration.

- **R8.** Gaia-X **GXDCH** compliance JWTs that require an RSA `x5c` JOSE header chain (and related header fields not supported by walt.id issuance for participant keys) must be signed using the **platform operator's RSA-2048** key and certificate material from the operator wallet — **ADR-002 OQ-1 resolved (Option B)**. (Participant RSA keys may still appear in `did.json` for interoperability, but are not the signing key for this GXDCH path in MVP.)

- **R9.** Company-issued VCs (for example Ownership, InsuranceQuote) must use the company's Ed25519 key with the `EdDSA` algorithm via the company wallet — not the operator wallet.

- **R10.** The Membership VC for a participant (proving they are a dataspace member) must be issued by the **platform operator's wallet**, not the participant's own wallet.

- **R11.** The car maker's Ownership VC issued to a car buyer must be signed by the car maker company's Ed25519 key.

### VC Storage

- **R12.** Signed VCs are stored in a walt.id wallet as the primary cryptographic store: **company-issued** credentials in the **company** wallet; **operator-issued** credentials (for example Membership, and any operator-signed Gaia-X artifacts held in the operator wallet) in the **operator** wallet. The backend keeps only a **credential index** (metadata + `walletCredentialId` where applicable).

- **R13.** The backend database must maintain a lightweight credential index: `credentialId`, `companyId`, `type`, `issuedAt`, `expiresAt`, `status`, `walletCredentialId`. No JWT is stored in the database.

- **R14.** The `OrgCredential.vcJwt` column must be removed. The `vcPayload` column (unsigned) may be retained for reference.

### VP Signing & Verification

- **R15.** The insurance portal's ownership proof request must use the OID4VP protocol. The VP must be signed by the user's own key via the portal-wallet app — no backend intermediation in signing.

- **R16.** The backend verifier service must resolve the issuer's DID to obtain the public key used for VP verification — never using a hardcoded platform key.

### Key Management (no keys in DB/filesystem)

- **R17.** The `PlatformKeypair` database table must be removed.

- **R18.** The `.keys/` filesystem directory must be removed.

- **R19.** The `VPSigner` service must be refactored: **company-scoped** signing delegates to the **company** walt.id wallet (Ed25519 path); **GXDCH / operator-trust-anchor** signing delegates to **`OperatorWalletService`** per ADR-002 OQ-1 resolution.

- **R20.** Private signing keys must never leave walt.id (no export to backend DB, filesystem, or durable in-app signing material). The backend uses wallet APIs and **public** JWKs only. **GXDCH (Option B)** uses **operator wallet** signing **inside walt.id** — **no** backend-held private PEM / `jose` signing for product credentials.

### BYOW Abstraction

- **R21.** The backend must define a `WalletIssuanceService` interface with two operations:
  - `issueCredential(issuerDid, credentialType, credentialData)` → returns credential offer URI (OID4VCI)
  - `verifyPresentation(vpToken, nonce, audience)` → returns verification result (OID4VP)

- **R22.** The current walt.id implementation must implement this interface, so a future "Bring Your Own Wallet" feature only replaces the implementation.

---

## Open Questions

> **ID alignment:** This PRD uses **OQ-1–OQ-3** aligned with ADR-002 integration topics; **OQ-4 / OQ-5** below are **product/ops** items (ADR table uses a shorter list — map by title, not only by number).

**OQ-1 — GXDCH x5c Header with Walt.id — RESOLVED (2026-04-15)**
The Gaia-X compliance endpoint (GXDCH) requires RSA JWTs with an `x5c` header containing an X.509 certificate chain (and related JOSE metadata). The walt.id Community Stack issuer API does **not** provide a supported, documented way to emit the required header surface for **participant RSA** keys in this product's MVP timeframe.

**Decision:** adopt **ADR-002 Option B** — **operator-custodial RSA** for GXDCH-bound JWTs/VPs; participant companies retain **Ed25519** in their own wallets for the bulk of credentials.

*Options considered (historical):*
  a. Issuer `headers` override — not available / not sufficient for this stack
  b. Hybrid re-sign or post-process JWTs — rejected for MVP (fragile, under-specified)
  c. Platform-level signing for GXDCH only — **chosen** (implemented as operator wallet RSA, not legacy `platform-signer`)

**OQ-2 — Walt.id Community Stack Multi-Key Support**
Verify that the walt.id Community Stack wallet supports multiple keys per wallet and that issuance/signing calls can specify a `keyId` to select which key to use.

**OQ-3 — Vault AppRole Auth for Backend**
The backend currently reads Vault secrets for EDC provisioning. Confirm the AppRole token has sufficient permissions to write new paths (`secret/company/*/wallet`) during onboarding.

**OQ-4 — DID Document Cache Invalidation**
When a company's keys are rotated (key rotation feature, out of scope for this sprint), the cached public key JWK in the database must be invalidated. Define the trigger mechanism.

**OQ-5 — Walt.id Account Limits**
Does the Community Stack impose any account/wallet count limits? At scale, each company requires one account and one wallet.

---

## Out of Scope (Future)

- Key rotation workflow
- Per-user wallet provisioning in walt.id (end users currently use the portal-wallet app backed by a DB Wallet model)
- Bring Your Own Wallet (BYOW) implementation (only the abstraction interface is in scope)
- HSM or hardware-backed key storage
- Multi-signature schemes
- VC revocation registry
