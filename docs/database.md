# Database

PostgreSQL 16 accessed via Prisma ORM. The schema has 15+ models covering vehicles, credentials, consent, insurance policies, EDC transactions, and audit trails.

**Connection:** `postgresql://postgres:postgres@localhost:5432/eu_jap_hack` (dev default)

---

## Table of Contents

- [Schema Overview](#schema-overview)
- [Models](#models)
- [Relationships](#relationships)
- [Migrations](#migrations)
- [Seeding](#seeding)

---

## Schema Overview

```
Company ──────────────── OrgCredential
                         (Gaia-X compliance)

Car ──── Purchase ──── Credential ──── Wallet ──── WalletCredential
         (ownership)   (VC storage)    (user)

Car ──── InsurancePolicy
Car ──── Consent ──── AccessSession
Car ──── VehicleAuditLog

PresentationRequest ──── PresentationSession
                         (VP pipeline state)

EdcTransaction
(EDC negotiation history)
```

---

## Models

### `Company`

Registered organizations in the dataspace.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | Primary key |
| `name` | String | Organization name |
| `vatId` | String? | VAT registration number |
| `eoriNumber` | String? | EORI (EU customs) number |
| `cin` | String? | Company identification number |
| `did` | String? | DID (did:web:...) |
| `country` | String | ISO country code |
| `address` | Json | Street, city, postal code |
| `createdAt` | DateTime | |

**Relations:** `OrgCredential[]`

---

### `OrgCredential`

Gaia-X organization credential records.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `companyId` | String | FK → Company |
| `status` | String | `pending`, `compliant`, `non_compliant`, `error` |
| `legalParticipantVc` | Json? | Constructed LegalParticipantVC |
| `complianceResult` | Json? | Raw GXDCH compliance response |
| `notaryResult` | Json? | Notary API response |
| `issuedVc` | Json? | Final issued compliance VC |
| `errorDetails` | String? | Error message if verification failed |
| `verifiedAt` | DateTime? | Timestamp of last verification attempt |
| `createdAt` | DateTime | |

---

### `Car`

Vehicle records with DPP data.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `vin` | String (unique) | Vehicle Identification Number |
| `make` | String | e.g., "Tata Motors" |
| `model` | String | e.g., "Nexon EV" |
| `year` | Int | Manufacturing year |
| `color` | String? | |
| `status` | String | `available`, `sold`, `reserved` |
| `price` | Float? | Listed price |
| `dpp` | Json? | Full Digital Product Passport (10 sections) |
| `imageUrl` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Relations:** `Purchase[]`, `InsurancePolicy[]`, `Consent[]`, `VehicleAuditLog[]`

---

### `Credential`

Generic Verifiable Credential storage.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `type` | String | `SelfVC`, `OwnershipVC`, `InsuranceVC`, `OrgVC` |
| `subjectId` | String | DID or userId of the credential subject |
| `issuerId` | String | DID of the issuer |
| `companyId` | String? | FK → Company (if org credential) |
| `vcJson` | Json | Full VC payload |
| `jwt` | String? | JWT-encoded VC (if applicable) |
| `issuedAt` | DateTime | |
| `expiresAt` | DateTime? | |

---

### `Wallet`

User credential collections.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `userId` | String (unique) | User identifier (Keycloak sub) |
| `createdAt` | DateTime | |

**Relations:** `WalletCredential[]`

---

### `WalletCredential`

Join table linking wallets to credentials (many-to-many).

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `walletId` | String | FK → Wallet |
| `credentialId` | String | FK → Credential |
| `addedAt` | DateTime | When credential was stored |

---

### `Purchase`

Vehicle purchase records.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `userId` | String | Buyer's user ID |
| `vin` | String | FK → Car.vin |
| `dealerName` | String? | |
| `purchaseDate` | DateTime | |
| `credentialId` | String? | FK → Credential (the OwnershipVC) |
| `price` | Float? | Final sale price |

---

### `InsurancePolicy`

Insurance policies linked to vehicles.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `vin` | String | FK → Car.vin |
| `policyNumber` | String (unique) | |
| `holderUserId` | String | Policy holder |
| `agentId` | String | Issuing agent |
| `premium` | Float | Annual premium |
| `coverageType` | String | `comprehensive`, `third_party`, etc. |
| `coverageDetails` | Json | Coverage breakdown |
| `premiumBreakdown` | Json | Factors used in calculation |
| `credentialId` | String? | FK → Credential (InsuranceVC) |
| `issuedAt` | DateTime | |
| `validUntil` | DateTime | |

---

### `Consent`

Data-sharing consent requests between participants.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `vin` | String | Vehicle the request is about |
| `requesterId` | String | Who is requesting access |
| `ownerId` | String | Vehicle owner |
| `purpose` | String | e.g., `insurance_underwriting` |
| `status` | String | `pending`, `approved`, `denied` |
| `requestedAt` | DateTime | |
| `resolvedAt` | DateTime? | |

**Relations:** `AccessSession[]`

---

### `AccessSession`

Ephemeral access token granted after consent approval.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | Also used as the access token |
| `consentId` | String | FK → Consent |
| `vin` | String | Vehicle access is granted for |
| `requesterId` | String | Who holds this session |
| `createdAt` | DateTime | |
| `expiresAt` | DateTime | 1 hour after creation |
| `used` | Boolean | Whether session has been consumed |

---

### `EdcTransaction`

Tracks EDC negotiation history.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `providerDspUrl` | String | Provider's EDC DSP endpoint |
| `providerBpn` | String | Provider BPNL |
| `assetId` | String | Requested asset |
| `status` | String | `in_progress`, `completed`, `failed` |
| `currentStep` | Int | 1–7 |
| `steps` | Json | Array of step log objects |
| `contractId` | String? | Negotiated contract ID |
| `transferId` | String? | Transfer process ID |
| `data` | Json? | Fetched asset data |
| `error` | String? | Error if failed |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | |

---

### `VehicleAuditLog`

Immutable audit trail for vehicle actions.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `vin` | String | FK → Car.vin |
| `action` | String | e.g., `purchased`, `dpp_updated`, `insurance_issued` |
| `actorId` | String | User who performed the action |
| `actorRole` | String | Their role at time of action |
| `details` | Json | Action-specific payload |
| `timestamp` | DateTime | |

---

### `PresentationRequest`

OpenID4VP request instances.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | Also used as `sessionId` |
| `requesterId` | String | Agent or service requesting VP |
| `vin` | String? | Related vehicle |
| `nonce` | String | Unique challenge |
| `challenge` | String | Domain binding challenge |
| `expectedTypes` | String[] | VC types expected in response |
| `status` | String | `pending`, `received`, `processing`, `complete`, `error` |
| `createdAt` | DateTime | |
| `expiresAt` | DateTime | |

**Relations:** `PresentationSession`

---

### `PresentationSession`

Tracks the VP processing pipeline state.

| Field | Type | Description |
|---|---|---|
| `id` | String (uuid) | |
| `requestId` | String | FK → PresentationRequest |
| `vpRaw` | String? | Raw VP JWT submitted by owner |
| `currentStep` | Int | 1–11 (see verifier pipeline) |
| `steps` | Json | Array of step objects with status + timestamps |
| `resolvedDid` | String? | Issuer DID resolved |
| `discoveredDspUrl` | String? | EDC DSP URL found in DID doc |
| `vehicleData` | Json? | Final DPP data (set at step 11) |
| `error` | String? | Error if pipeline failed |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## Relationships

```
Company
  └─ OrgCredential (1:many)

Car
  ├─ Purchase (1:many)
  ├─ InsurancePolicy (1:many)
  ├─ Consent (1:many)
  └─ VehicleAuditLog (1:many)

Consent
  └─ AccessSession (1:many)

Wallet
  └─ WalletCredential (1:many) ──► Credential

Purchase
  └─ Credential (1:1, optional)

InsurancePolicy
  └─ Credential (1:1, optional)

PresentationRequest
  └─ PresentationSession (1:1)
```

---

## Migrations

Prisma manages all schema migrations.

```bash
# Apply pending migrations (runs automatically on container start)
npx prisma migrate deploy

# Create a new migration during development
cd backend
npx prisma migrate dev --name "describe_your_change"

# Reset database and re-apply all migrations (destructive)
npx prisma migrate reset
```

Migration files live in `backend/prisma/migrations/`. Each migration is a timestamped SQL file.

---

## Seeding

`backend/prisma/seed.ts` creates demo data on every fresh database. Run automatically by `docker-entrypoint.sh`.

**What the seed creates:**

1. **TATA Motors company** — with address and VAT details
2. **Demo vehicles** — 3–5 cars with VINs, specs, and partial DPP data
3. **Mario Sanchez's wallet** — pre-loaded with a SelfVC
4. **Sample org credential** — in `pending` status for demo purposes

To re-run manually:

```bash
cd backend
npx prisma db seed
```

> **Note:** The seed is idempotent — it uses `upsert` operations. Running it twice won't create duplicate records.
