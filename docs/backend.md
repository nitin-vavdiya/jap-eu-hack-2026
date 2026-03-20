# Backend

The backend is a single Express.js API (Node.js 20, TypeScript) that serves all 6 frontend portals. It manages database access via Prisma, orchestrates external services (Keycloak, walt.id, EDC, Gaia-X), and implements all business logic.

**Base URL:** `http://localhost:8000/api` (dev) | `https://jeh-api.tx.the-sense.io/api` (prod)

---

## Table of Contents

- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Authentication Middleware](#authentication-middleware)
- [API Reference](#api-reference)
- [Services](#services)
- [Error Handling](#error-handling)

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                    App bootstrap, route mounting
│   ├── db.ts                       Prisma client singleton
│   ├── middleware/
│   │   └── auth.ts                 JWT validation + role guards
│   ├── routes/
│   │   ├── cars.ts                 Vehicle CRUD
│   │   ├── vehicle-registry.ts     Public vehicle resolution + DPP
│   │   ├── credentials.ts          Credential storage
│   │   ├── wallet.ts               User credential wallet
│   │   ├── wallet-vp.ts            VP generation
│   │   ├── org-credentials.ts      Gaia-X org registration + verification
│   │   ├── consent.ts              Consent requests & approval
│   │   ├── insurance.ts            Policy issuance
│   │   ├── verifier.ts             OpenID4VP + 11-step pipeline
│   │   ├── edc.ts                  EDC negotiation wrapper
│   │   ├── cadde.ts                CADDE data exchange
│   │   ├── companies.ts            Company directory
│   │   ├── purchases.ts            Vehicle purchase records
│   │   └── did.ts                  DID document serving
│   ├── services/
│   │   ├── gaiax/                  Gaia-X compliance suite (6 files)
│   │   ├── edcConsumerService.ts   7-step EDC negotiation
│   │   ├── vp-processor.ts         VP parsing & validation
│   │   ├── did-resolver.ts         did:web / did:eu-dataspace resolution
│   │   ├── dataservice-discovery.ts  EDC DSP URL extraction
│   │   └── waltid.ts               walt.id API wrapper
│   └── types/
├── prisma/
│   ├── schema.prisma               15+ model definitions
│   ├── migrations/                 PostgreSQL migration files
│   └── seed.ts                     Demo data seeding
├── Dockerfile                      Multi-stage Node 20 Alpine
├── docker-entrypoint.sh            prisma migrate + seed on start
└── .env.example                    Configuration template
```

---

## Configuration

Copy `.env.example` to `.env` and edit as needed. All variables are shown below with their development defaults.

### Core

```env
NODE_ENV=development
PORT=8000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eu_jap_hack
APP_BASE_URL=http://localhost:8000
```

### Auth

```env
AUTH_ENABLED=false                    # Set true for Keycloak JWT validation
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=eu-jap-hack
```

> **Note:** When `AUTH_ENABLED=false`, the backend uses mock users. The `userId` query parameter selects the active mock user. See [Authentication Middleware](#authentication-middleware) for details.

### walt.id

```env
WALTID_WALLET_URL=http://localhost:7001
WALTID_ISSUER_URL=http://localhost:7002
WALTID_VERIFIER_URL=http://localhost:7003
```

### Gaia-X

```env
GAIAX_MOCK_MODE=true                  # false = call real GXDCH endpoints
GAIAX_TIMEOUT=15000                   # Request timeout (ms)
GAIAX_RETRY_ATTEMPTS=2
GAIAX_RETRY_DELAY=1000
```

### EDC

```env
ENABLE_EDC=true
EDC_BASE_URL=https://tata-motors-controlplane.tx.the-sense.io
EDC_API_KEY=tata-motors
BPN_NUMBER=BPNL00000000024R
EDC_ACCESS_POLICY_ID=policy_2
EDC_CONTRACT_POLICY_ID=policy_2
EDC_CONSUMER_MANAGEMENT_URL=https://nissan-motors-controlplane.tx.the-sense.io
EDC_NEGOTIATION_INITIAL_DELAY_MS=5000
EDC_NEGOTIATION_POLL_INTERVAL_MS=5000
EDC_NEGOTIATION_MAX_RETRIES=3
```

### CADDE

```env
CADDE_ASSET_ID=asset_7
CADDE_PARTNER_EDC_DSP_URL=https://partner-protocol.example.com
CADDE_PARTNER_EDC_BPN=BPNL000000000001
```

---

## Authentication Middleware

`backend/src/middleware/auth.ts` exports three middleware functions:

### `authenticate`

Requires a valid JWT. Used on protected routes.

```
AUTH_ENABLED=true:
  - Extract Bearer token from Authorization header
  - Validate signature against Keycloak's JWKS endpoint
  - Decode realm_access.roles
  - Attach user to req.user

AUTH_ENABLED=false:
  - Read userId from query param or request body
  - Look up mock user by ID
  - Attach mock user to req.user
```

### `optionalAuth`

Same as `authenticate` but does not reject if no token is present. `req.user` may be `undefined`.

### `requireRole(role)`

Middleware factory. Returns 403 if `req.user` does not have the specified role.

```typescript
router.post('/cars', authenticate, requireRole('admin'), createCar)
```

**Available roles:**

| Role | Holder |
|---|---|
| `admin` | TATA Motors admin |
| `customer` | Vehicle owner |
| `insurance_agent` | Digit Insurance agent |
| `company_admin` | Organization administrator |

---

## API Reference

### Health

```
GET /api/health
```

Returns server status, version, and `AUTH_ENABLED` flag.

```json
{
  "status": "ok",
  "authEnabled": false,
  "version": "1.0.7"
}
```

---

### Vehicles

```
GET    /api/cars                        List all vehicles
GET    /api/cars/:vin                   Get vehicle by VIN (includes DPP)
POST   /api/cars                        Create vehicle           [admin]
PUT    /api/cars/:vin                   Update vehicle / DPP     [admin]
```

**DPP structure** (stored as JSON in `Car.dpp`): 10 sections — identity, powertrain, emissions, materials, damage, service history, ownership, end-of-life, digital services, compliance.

---

### Vehicle Registry

Public endpoints for external consumers to resolve vehicle data.

```
GET /api/vehicle-registry/vehicles/:vin
```

Returns public vehicle summary + available policies + linked credentials.

```
GET /api/vehicle-registry/vehicles/:vin/dpp
```

Returns full DPP. Requires valid `AccessSession` token (set via `x-access-token` header) or owner auth.

```
GET /api/vehicle-registry/vehicles/:vin/audit-log
```

Returns chronological audit events for the vehicle.

---

### Credentials & Wallet

```
GET    /api/credentials                 List all credentials
GET    /api/credentials/:id             Get credential by ID
GET    /api/credentials/company/:id     List credentials for a company
GET    /api/wallet/:userId              Get user's wallet (held credentials)
```

---

### VP Generation

```
POST /api/wallet-vp/generate-vp
```

Generates a Verifiable Presentation from a user's held credentials.

**Request body:**

```json
{
  "userId": "mario-sanchez",
  "credentialTypes": ["OwnershipVC", "SelfVC"],
  "challenge": "abc123",
  "domain": "https://insurance.example.com"
}
```

**Response:** Signed VP as JWT or JSON-LD.

---

### Organization Credentials (Gaia-X)

```
GET    /api/org-credentials             List all org credentials
GET    /api/org-credentials/:id         Get with compliance results
POST   /api/org-credentials             Create org credential  [company_admin]
POST   /api/org-credentials/:id/verify  Submit for Gaia-X verification [company_admin]
```

The `verify` endpoint triggers the full Gaia-X compliance orchestration (Notary + Compliance API). See [docs/flows/gaiax-compliance.md](flows/gaiax-compliance.md).

---

### Consent

```
GET    /api/consent/check               Check if consent exists (idempotent check)
GET    /api/consent/pending/:userId     List pending consents for user
GET    /api/consent/history/:userId     Consent history
POST   /api/consent/request             Create consent request   [auth]
PUT    /api/consent/:id/approve         Approve consent          [auth]
PUT    /api/consent/:id/deny            Deny consent             [auth]
```

Approving consent creates an `AccessSession` (1-hour TTL) that the requester can use to access protected registry endpoints.

---

### Insurance

```
GET    /api/insurance                   List all policies
GET    /api/insurance/:vin              Get policy for vehicle
POST   /api/insurance                   Create policy + issue InsuranceVC   [insurance_agent]
```

---

### Verifier (OpenID4VP)

```
POST   /api/verifier                    Create presentation request
GET    /api/verifier/:sessionId/status  Poll session status
GET    /api/verifier/:sessionId/steps   Get detailed pipeline steps
```

Creating a presentation request initiates a `PresentationSession` that tracks 11 steps:

1. Create VP request
2. Wait for VP submission
3. Parse VP
4. Extract credentials
5. Validate VP proof
6. Resolve issuer DID
7. Discover DataService endpoint
8. Extract EDC DSP URL
9. Initiate EDC negotiation
10. Fetch DPP data
11. Complete

---

### EDC

```
POST   /api/edc/negotiate               Start 7-step EDC negotiation (SSE stream)
GET    /api/edc/transactions            List negotiation history
GET    /api/edc/transactions/:id        Get transaction details
```

The `/negotiate` endpoint supports SSE (`Accept: text/event-stream`) for real-time step updates. See [docs/flows/edc-negotiation.md](flows/edc-negotiation.md).

---

### CADDE

```
POST /api/cadde/transfer
```

Initiates a CADDE cross-domain data exchange. Uses `CADDE_ASSET_ID` and `CADDE_PARTNER_EDC_DSP_URL` from environment.

---

### Companies

```
GET    /api/companies                   List all companies
GET    /api/companies/:id               Get company by ID
POST   /api/companies                   Create company   [company_admin]
```

---

### DID Document

```
GET /.well-known/did.json
GET /.well-known/vehicle-registry
```

The backend serves its own DID document, allowing other participants to discover its service endpoints (EDC DSP URL, etc.).

---

## Services

### `edcConsumerService.ts`

Implements the 7-step EDC negotiation protocol. Key function:

```typescript
async negotiateAndFetch(
  providerDspUrl: string,
  providerBpn: string,
  assetId: string,
  onProgress?: (step: number, status: string) => void
): Promise<{ data: any; transaction: EdcTransaction }>
```

Steps are tracked in `EdcTransaction` records. `onProgress` callback enables SSE streaming.

Configurable via env vars: `EDC_NEGOTIATION_POLL_INTERVAL_MS`, `EDC_NEGOTIATION_MAX_RETRIES`, `EDC_NEGOTIATION_INITIAL_DELAY_MS`.

---

### `gaiax/orchestrator.ts`

Orchestrates Gaia-X compliance verification. Key method:

```typescript
async verifyOrganization(orgCredentialId: string): Promise<ComplianceResult>
```

Internally:
1. Health-checks all configured GXDCH endpoints
2. Selects a healthy endpoint set
3. Calls `vc-builder.ts` to construct `LegalParticipantVC`
4. Calls `vp-signer.ts` to sign the VP
5. Submits to Notary API → gets `RegistrationNumberVC`
6. Submits to Compliance API → gets compliance verdict
7. Updates `OrgCredential` record with results

**Mock mode** (`GAIAX_MOCK_MODE=true`): Returns synthetic successful responses. Enable for local dev.

---

### `waltid.ts`

Wrapper around the three walt.id APIs.

| Function | API | Description |
|---|---|---|
| `issueCredentialOID4VCI()` | issuer-api | Returns OID4VCI credential offer URI |
| `issueCredentialDirect()` | issuer-api | Direct JWT issuance via `/sdjwt/sign` |
| `ensureWalletAccount()` | wallet-api | Auto-create or login wallet account |
| `storeCredentialInWallet()` | wallet-api | Store credential offer in wallet |
| `listWalletCredentials()` | wallet-api | Get all held credentials |
| `verifyPresentationOID4VP()` | verifier-api | Verify OID4VP presentation |

---

### `did-resolver.ts`

Resolves DID documents:
- `did:web` — fetches `https://<domain>/.well-known/did.json`
- `did:eu-dataspace` — custom registry lookup (for future use)

Returns parsed DID document including `service` array.

---

### `dataservice-discovery.ts`

Extracts EDC service information from a resolved DID document:

```typescript
async discoverDataService(didDocument: DIDDocument): Promise<{
  dspUrl: string;
  bpn: string;
}>
```

Filters `service` entries where `type === "DataService"` and parses the `serviceEndpoint` for EDC DSP URL and provider BPNL.

---

### `vp-processor.ts`

Handles VP parsing and validation:
- `parseVP(vpJwt)` — Deserialize VP (JWT or JSON-LD)
- `extractCredentials(vp)` — Extract credential array
- `validateVP(vp)` — Verify proof signatures

Updates `PresentationSession.steps` at each stage for frontend polling.

---

## Error Handling

The backend uses a consistent error response format:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {}
}
```

Common HTTP status codes:
- `400` — Invalid request body or missing required fields
- `401` — Missing or invalid JWT
- `403` — Valid JWT but insufficient role
- `404` — Resource not found
- `409` — Conflict (e.g., consent already exists)
- `500` — Internal server error (external service failure)

> **Important:** EDC and Gaia-X errors bubble up as 500s with descriptive messages. Check `error.details` for the upstream error body.
