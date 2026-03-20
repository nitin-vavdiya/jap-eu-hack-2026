# EU-JAP Hack 2026 — Decentralized Vehicle Dataspace

> A cross-border, consent-driven vehicle data sharing platform built on W3C Verifiable Credentials, Gaia-X compliance, and Eclipse Dataspace Connectors.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node 20](https://img.shields.io/badge/Node-20-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![Helm](https://img.shields.io/badge/Helm-3.x-blue.svg)](https://helm.sh)

---

## Overview

This platform demonstrates a decentralized dataspace where vehicle manufacturers, insurers, and vehicle owners exchange sensitive vehicle data — securely, with consent, and in compliance with Gaia-X and EU data sovereignty standards.

**Key capabilities:**
- Vehicle owners hold their own credentials (W3C Verifiable Credentials) in a digital wallet
- Insurers request data through sovereign EDC (Eclipse Dataspace Connector) channels
- Organizations prove Gaia-X compliance before participating in the dataspace
- All data flows are consent-gated, auditable, and cryptographically verifiable

**Participants in this demo:**
- **TATA Motors** — Vehicle manufacturer (data provider)
- **Digit Insurance** — Insurer (data consumer)
- **Mario Sanchez** — Vehicle owner (credential holder)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     6 React Portals (Vite + Tailwind)               │
│  Dataspace  │  TATA Admin  │  Public Showroom  │  Wallet  │  ...    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTPS REST
                     ┌─────────────▼──────────────┐
                     │   Express.js API (Node 20)  │
                     │   Prisma ORM + PostgreSQL    │
                     └──┬────┬─────┬────┬────┬─────┘
                        │    │     │    │    │
              ┌─────────┘  ┌─┘   ┌─┘  ┌─┘  └────────────┐
              ▼            ▼     ▼    ▼                    ▼
         Keycloak      walt.id  Gaia-X  EDC (Tractus-X)  CADDE
        (Identity)   (Wallets) (Compl.) (Sovereign Data) (Cross-domain)
```

**Design philosophy:** Credentials travel with their holder. Data providers expose assets through EDC with ODRL policies. Consumers negotiate contracts before accessing data. Gaia-X compliance ensures only verified organizations participate.

---

## Apps & Services

| App / Service | Port | Role | Purpose |
|---|---|---|---|
| `portal-dataspace` | 3001 | Company Admin | Organization registry & Gaia-X credential management |
| `portal-tata-admin` | 3002 | Admin | Fleet management & Digital Product Passport editor |
| `portal-tata-public` | 3003 | Customer | Public vehicle marketplace & purchase flow |
| `portal-wallet` | 3004 | Customer | Digital credential wallet & VP presentation |
| `portal-insurance` | 3005 | Insurance Agent | Underwriting via OpenID4VP verification |
| `portal-company` | 3006 | Company Admin | Organization directory & credential viewer |
| `backend` | 8000 | — | Express.js API (shared by all portals) |
| `keycloak` | 8080 | — | Identity provider (OIDC, realm: `eu-jap-hack`) |
| `waltid-wallet-api` | 7001 | — | W3C credential wallet (storage + VP generation) |
| `waltid-issuer-api` | 7002 | — | OID4VCI credential issuance |
| `waltid-verifier-api` | 7003 | — | OID4VP presentation verification |
| `postgres` | 5432 | — | Primary database (15+ models) |

---

## Tech Stack

### Frontend
| Technology | Usage |
|---|---|
| React 18 + TypeScript | All 6 portals |
| Vite | Build tooling |
| Tailwind CSS | Styling |
| React Router v6 | Client-side routing |
| Axios | HTTP client |
| `@eu-jap-hack/auth` | Shared OIDC authentication |

### Backend
| Technology | Usage |
|---|---|
| Node.js 20 + Express.js | API server |
| TypeScript | Language |
| Prisma ORM | Database access |
| PostgreSQL 16 | Primary database |
| Keycloak 26.0 (RS256 JWT) | Auth & authorization |

### Identity & Credentials
| Technology | Standard |
|---|---|
| walt.id issuer-api | OID4VCI |
| walt.id wallet-api | W3C VC storage |
| walt.id verifier-api | OID4VP |
| `did:web`, `did:eu-dataspace` | DID methods |
| RSA-2048 | VP signing |

### Dataspace & Compliance
| Technology | Purpose |
|---|---|
| Eclipse Dataspace Connector (Tractus-X) | Sovereign data exchange |
| ODRL policies | Access control |
| Gaia-X GXDCH (Notary + Compliance APIs) | Organization verification |
| CADDE protocol | Cross-domain data exchange |

### Infrastructure
| Technology | Usage |
|---|---|
| Docker + Docker Compose | Local development |
| Kubernetes + Helm 3 | Production deployment |
| AWS ECR Public | Container registry |
| nginx + cert-manager | Ingress + TLS |
| linux/amd64 + linux/arm64 | Multi-arch builds |

---

## Key Flows

| Flow | Actors | What happens |
|---|---|---|
| **Vehicle Purchase** | Owner + TATA | Buy a car → instantly receive an OwnershipVC in your wallet |
| **Insurance VP Verification** | Agent + Owner | Agent requests VP → Owner presents credentials → EDC fetches DPP |
| **EDC Data Negotiation** | Consumer + Provider | 7-step sovereign contract negotiation before any data transfer |
| **Gaia-X Compliance** | Admin + GXDCH | Submit org credentials → receive compliance VC from trusted authority |
| **Consent-Based Access** | Owner + Requester | Request → approve → receive ephemeral access token |

> See [`docs/flows/`](docs/flows/) for detailed step-by-step breakdowns.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- npm 10+

### 1. Clone & Install

```bash
git clone https://github.com/smartSenseSolutions/jap-eu-hack-2026.git
cd jap-eu-hack-2026
npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Defaults work for local development — no changes required
```

Key development defaults:
```env
AUTH_ENABLED=false       # Mock users instead of Keycloak
GAIAX_MOCK_MODE=true     # Mock Gaia-X API responses
ENABLE_EDC=true          # Enable EDC negotiation
```

### 3. Start All Services

```bash
docker compose up -d
```

Starts PostgreSQL, Keycloak, walt.id (wallet + issuer + verifier), backend, and all 6 portals.

### 4. Access the Portals

| Portal | URL |
|---|---|
| Dataspace Registry | http://localhost:3001 |
| TATA Admin | http://localhost:3002 |
| Public Showroom | http://localhost:3003 |
| Wallet | http://localhost:3004 |
| Insurance | http://localhost:3005 |
| Company Directory | http://localhost:3006 |
| Backend API health | http://localhost:8000/api/health |
| Keycloak Admin | http://localhost:8080 (admin / admin) |

### Mock Users (AUTH_ENABLED=false)

| User | Role | Portal |
|---|---|---|
| `tata-admin` | admin | TATA Admin (port 3002) |
| `mario-sanchez` | customer | Wallet (3004), Public Showroom (3003) |
| `digit-agent` | insurance_agent | Insurance (3005) |
| `company-admin` | company_admin | Dataspace (3001), Company (3006) |

### Database Seeding

The backend auto-runs migrations and seeding on startup. To run manually:
```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

---

## Documentation Structure

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, component interactions, decisions |
| [docs/backend.md](docs/backend.md) | API reference, services, middleware, config |
| [docs/frontend.md](docs/frontend.md) | Portal breakdown, shared packages, auth |
| [docs/database.md](docs/database.md) | Schema reference, models, relationships |
| [docs/devops.md](docs/devops.md) | Docker, Helm, Kubernetes deployment |
| [docs/flows/vehicle-purchase.md](docs/flows/vehicle-purchase.md) | Vehicle purchase & OwnershipVC issuance |
| [docs/flows/insurance-verification.md](docs/flows/insurance-verification.md) | OpenID4VP insurance underwriting |
| [docs/flows/edc-negotiation.md](docs/flows/edc-negotiation.md) | 7-step EDC sovereign data negotiation |
| [docs/flows/gaiax-compliance.md](docs/flows/gaiax-compliance.md) | Gaia-X organization verification |
| [docs/flows/consent-access.md](docs/flows/consent-access.md) | Consent-based data access |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional messages: `git commit -m "feat: description"`
4. Open a PR against `main`

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

*Built for the EU-Japan Hackathon 2026 by [SmartSense Solutions](https://smartsensesolutions.com)*
