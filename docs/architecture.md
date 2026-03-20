# Architecture

This document covers the overall system design of the EU-JAP Hack 2026 Decentralized Vehicle Dataspace — how components are organized, why they were designed this way, and how they interact.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Component Map](#component-map)
- [Monorepo Structure](#monorepo-structure)
- [Frontend Layer](#frontend-layer)
- [Backend Layer](#backend-layer)
- [Identity & Credential Layer](#identity--credential-layer)
- [Dataspace Layer](#dataspace-layer)
- [Compliance Layer](#compliance-layer)
- [Cross-Cutting Concerns](#cross-cutting-concerns)
- [Design Decisions](#design-decisions)

---

## High-Level Overview

The platform is a **microservices-flavored monorepo**: multiple specialized portals and a shared backend, all deployed as independent containers but developed together.

```
                          ┌─ portal-dataspace (3001) ─┐
                          ├─ portal-tata-admin (3002) ─┤
Internet  ──►  nginx  ──► ├─ portal-tata-public (3003) ┤
(ingress)                 ├─ portal-wallet (3004) ──────┤
                          ├─ portal-insurance (3005) ───┤
                          └─ portal-company (3006) ─────┘
                                     │ REST/JSON
                          ┌──────────▼───────────┐
                          │     backend :8000     │
                          │  Express + Prisma     │
                          └──┬──┬──┬──┬──┬───────┘
                             │  │  │  │  │
                  ┌──────────┘  │  │  │  └────────────┐
                  ▼             ▼  ▼  ▼                ▼
             PostgreSQL    Keycloak  walt.id  Gaia-X GXDCH
              :5432         :8080  :7001-7003  (external)
                                              EDC / CADDE
                                              (external)
```

### Why a Single Backend?

All 6 portals talk to one Express API. This was a deliberate tradeoff:

- **Simplicity** — One deployment, one database, one set of secrets
- **Hackathon speed** — No service mesh, no gRPC, no distributed tracing overhead
- **Shared business logic** — Consent checks, EDC negotiation, and VC issuance are reused across portals

The portals themselves are independent (separate repos/builds), but they share business logic through the API and UI logic through npm packages.

---

## Component Map

```
jap-eu-hack-2026/
├── apps/              6 React Vite frontends
├── backend/           Express API + all business logic
├── packages/          Shared npm packages (auth, types, ui-tokens)
├── helm/              Kubernetes Helm chart
├── keycloak/          Realm config + custom theme
├── waltid/            walt.id service configs
├── scripts/           Dev utilities (seed, verify)
└── tests/             Integration tests (Gaia-X, Keycloak)
```

---

## Monorepo Structure

The project uses **npm workspaces**. All packages share a root `node_modules` and are cross-referenced by workspace name.

```json
// package.json (root)
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "backend"
  ]
}
```

**Shared packages:**

| Package | Name | Contents |
|---|---|---|
| `packages/auth` | `@eu-jap-hack/auth` | OIDC provider, hooks, login UI, axios factory |
| `packages/shared-types` | `@eu-jap-hack/shared-types` | TypeScript interfaces (DPP, AAS, credentials) |
| `packages/ui-tokens` | `@eu-jap-hack/ui-tokens` | Design tokens & Tailwind theme config |

Every portal imports from these packages — no copy-paste of auth logic or types.

---

## Frontend Layer

Six React 18 portals, each a Vite SPA served by nginx in production.

**Portal responsibilities:**

| Portal | Primary Actor | Core Job |
|---|---|---|
| `portal-dataspace` | Company Admin | Register organizations, manage Gaia-X credentials |
| `portal-tata-admin` | TATA Admin | Manage vehicle fleet, create/edit DPPs |
| `portal-tata-public` | Vehicle Owner | Browse & purchase vehicles |
| `portal-wallet` | Vehicle Owner | Hold credentials, respond to VP requests |
| `portal-insurance` | Insurance Agent | Verify vehicles, calculate premiums, issue policies |
| `portal-company` | Any | Browse verified organizations |

**Shared patterns across all portals:**
1. `AuthProvider` wraps the app root (from `@eu-jap-hack/auth`)
2. `ProtectedRoute` gates routes by Keycloak role
3. `createAuthAxios()` injects JWT into all API calls
4. Runtime config injected via `window.__CONFIG__` (nginx entrypoint sets this)

**Runtime configuration:** Portals don't bake in environment-specific URLs at build time. Instead, nginx's `docker-entrypoint.sh` writes a `config.js` that sets `window.__CONFIG__`, which the app reads on startup. This means one Docker image works across all environments.

```
nginx/docker-entrypoint.sh
  └─ writes /usr/share/nginx/html/config.js
       └─ window.__CONFIG__ = { VITE_API_BASE_URL: "...", ... }
```

---

## Backend Layer

A single Express.js server with 18+ route modules. All routes are mounted under `/api`.

**Key modules:**

```
backend/src/
├── index.ts          App bootstrap, route mounting
├── db.ts             Prisma client singleton
├── middleware/
│   └── auth.ts       Keycloak JWT validation + role checks
├── routes/           18 endpoint modules
└── services/
    ├── gaiax/        Gaia-X compliance orchestration (6 files)
    ├── edcConsumerService.ts   7-step EDC negotiation
    ├── vp-processor.ts         VP parsing & validation
    ├── did-resolver.ts         did:web resolution
    ├── dataservice-discovery.ts  EDC DSP extraction from DID doc
    └── waltid.ts               walt.id API wrapper
```

**Authentication middleware:**

```
Request
  └─ authenticate()
       ├─ AUTH_ENABLED=true: validate Keycloak JWT (RS256)
       │    └─ attach user to req.user
       └─ AUTH_ENABLED=false: attach mock user (by userId param or default)
```

The `AUTH_ENABLED` flag lets developers run locally without Keycloak while keeping production secure.

---

## Identity & Credential Layer

### Keycloak

- Identity provider for all 6 portals
- Realm: `eu-jap-hack`
- Protocol: OpenID Connect
- Tokens: RS256-signed JWT
- Roles: `admin`, `customer`, `insurance_agent`, `company_admin`
- Custom theme: `smartsense-loire` (branded login pages)

### walt.id

Three separate API services for credential lifecycle:

```
waltid-issuer-api  :7002   OID4VCI flow (credential offers)
waltid-wallet-api  :7001   Credential storage + VP generation
waltid-verifier-api :7003  OID4VP presentation verification
```

**Credential types issued:**

| VC Type | Issued by | Held by |
|---|---|---|
| `SelfVC` | Backend (on registration) | Vehicle owner |
| `OwnershipVC` | TATA (on purchase) | Vehicle owner |
| `InsuranceVC` | Digit (on policy issuance) | Vehicle owner |
| `OrgVC` / `LegalParticipantVC` | Gaia-X / Backend | Organization |

### DID Resolution

The backend resolves DIDs to discover service endpoints:

```
did:web:tata.example.com
  └─ GET https://tata.example.com/.well-known/did.json
       └─ Parse serviceEndpoint where type = "DataService"
            └─ Extract EDC DSP URL + BPNL
```

This is how the backend dynamically discovers the provider's EDC endpoint from the credential issuer's DID document, without hardcoding URLs.

---

## Dataspace Layer

### Eclipse Dataspace Connector (EDC / Tractus-X)

The platform uses EDC for sovereign data exchange. Data consumers never access data directly — they must negotiate a contract first.

```
Consumer (Digit)             Provider (TATA)
     │                            │
     ├─ 1. Query catalog ────────►│
     │◄─ catalog response ────────┤
     ├─ 2. Send contract offer ──►│
     │◄─ negotiation ID ──────────┤
     ├─ 3. Poll until AGREED ─────┤ (polling loop)
     ├─ 4. Initiate transfer ────►│
     │◄─ transfer process ID ─────┤
     ├─ 5. Poll for EDR token ────┤ (polling loop)
     ├─ 6. Get auth code ────────►│ (data plane)
     ├─ 7. Fetch data ───────────►│
     │◄─ DPP payload ─────────────┤
```

See [docs/flows/edc-negotiation.md](flows/edc-negotiation.md) for full details.

### CADDE

CADDE (Cross-domain Architecture for Data Distribution and Exchange) is a Japanese data exchange standard. The platform supports CADDE transfers via `/api/cadde/transfer`, following the same principle of sovereign, contract-based data exchange.

---

## Compliance Layer

### Gaia-X

Before an organization can participate in the dataspace, it must prove it exists and is compliant with Gaia-X standards. The backend's `GaiaXOrchestrator` handles this:

```
Admin submits org details
  └─ GaiaXOrchestrator
       ├─ Health-check all GXDCH endpoints
       ├─ Select healthy endpoint set
       ├─ Build LegalParticipantVC (with gx:registrationNumber, addresses)
       ├─ Sign VP (RSA-SHA256)
       ├─ Submit to Notary → receive RegistrationNumberVC
       ├─ Submit to Compliance API → receive ComplianceResult
       └─ Store result in OrgCredential record
```

**Mock mode:** `GAIAX_MOCK_MODE=true` returns synthetic responses, enabling development without real GXDCH endpoints.

---

## Cross-Cutting Concerns

### Audit Trail

Every significant action on a vehicle is written to `VehicleAuditLog`:
- Who did what, when
- What VIN was involved
- Details payload (JSON)

### Consent Gating

Sensitive vehicle data (full DPP) is protected behind consent:
1. Requester creates a `Consent` record (`pending`)
2. Owner approves → backend creates `AccessSession` (1-hour TTL)
3. Requester presents session token to access protected endpoints

### SSE Streaming

EDC negotiation (7 steps, ~30 seconds) uses Server-Sent Events to stream progress back to the browser:

```
POST /api/edc/negotiate
  └─ response: text/event-stream
       ├─ data: {"step": 1, "status": "querying_catalog"}
       ├─ data: {"step": 2, "status": "negotiating_contract"}
       ...
       └─ data: {"step": 7, "status": "complete", "data": {...}}
```

---

## Design Decisions

### Decision: One API, many portals

**Why:** Faster to build, simpler to operate during a hackathon. All portals share consent logic, EDC orchestration, and VC issuance.

**Trade-off:** A single API is a single point of failure. In production, you'd want to split into separate services (vehicle service, credential service, dataspace service).

### Decision: AUTH_ENABLED toggle

**Why:** Real Keycloak setup is time-consuming for local development. The mock user system lets developers work on any portal without configuring SSO.

**Trade-off:** The mock user IDs must match what the real Keycloak would send, or you get subtle bugs. The seed data is aligned to the mock user list.

### Decision: Gaia-X orchestrator with health-checking

**Why:** GXDCH endpoints can be unreliable (especially in staging). The orchestrator tests endpoints before use and falls back to healthy alternatives.

**Trade-off:** Extra latency on first call. Mitigated by caching the health check results.

### Decision: DID-based EDC discovery

**Why:** Hardcoding EDC endpoint URLs into the backend would make the system non-portable. By storing the EDC DSP URL in the issuer's DID document, any consumer can discover it dynamically from a VC.

**Trade-off:** Requires the issuer to maintain a resolvable `did:web` document. If the DID document is stale, discovery fails.

### Decision: VP pipeline with 11 tracked steps

**Why:** The VP → EDC → DPP flow is complex (~30s end-to-end). Tracking each step with a `PresentationSession` record lets the frontend poll for progress and show users exactly where in the pipeline their request is.

**Trade-off:** More database writes per request. Acceptable given the low request volume for this use case.
